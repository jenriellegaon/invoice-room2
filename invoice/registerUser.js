'use strict';

var Fabric_Client = require('fabric-client');
var Fabric_CA_Client = require('fabric-ca-client');

var path = require('path');
var util = require('util');
var os = require('os');

var fabric_client = new Fabric_Client();
var fabric_ca_client = null;
var admin_user = null;

var member_user_ibm = null;
var member_user_lotus = null;
var member_user_ubp = null;

var secret_ibm = null;
var secret_lotus = null;
var secret_ubp = null;

var store_path = path.join(__dirname, 'hfc-key-store');
console.log(' Store path:'+store_path);

Fabric_Client.newDefaultKeyValueStore({ path: store_path})

        .then((state_store) => {

            fabric_client.setStateStore(state_store);
            var crypto_suite = Fabric_Client.newCryptoSuite();

            var crypto_store = Fabric_Client.newCryptoKeyStore({path: store_path});
            crypto_suite.setCryptoKeyStore(crypto_store);
            fabric_client.setCryptoSuite(crypto_suite);
            var	tlsOptions = {
                trustedRoots: [],
                verify: false
            };

            fabric_ca_client = new Fabric_CA_Client('http://localhost:7054', null , '', crypto_suite);

            return fabric_client.getUserContext('admin', true);
        })

        .then((user_from_store) => {

            if (user_from_store && user_from_store.isEnrolled()) {
                console.log('Successfully loaded admin from persistence');
                admin_user = user_from_store;
            } else {
                throw new Error('Failed to get admin.... run enrollAdmin.js');
            }

            let attributes = [
                //Supplier
                {name:"username", value:"IBM",ecert:true },

                //OEM
                {name:"username", value:"Lotus",ecert:true },

                //Bank
                {name:"username", value:"UBP",ecert:true }
            ];

            return fabric_ca_client
                .register({enrollmentID: 'IBM', affiliation: 'org1.department1',role: 'supplier', attrs: attributes}, admin_user)
                .then((ibm_secret)=>{
                    secret_ibm = ibm_secret
                    return fabric_ca_client
                        .register({enrollmentID: 'Lotus', affiliation: 'org1.department1',role: 'oem', attrs: attributes}, admin_user)
                        .then((lotus_secret)=>{
                            secret_lotus = lotus_secret
                            return fabric_ca_client
                                .register({enrollmentID: 'UBP', affiliation: 'org1.department1',role: 'bank', attrs: attributes}, admin_user);
                        })
                })
        })
        
        .then((ubp_secret) => {
            secret_ubp = ubp_secret
            console.log('Successfully registered IBM - secret:'+ secret_ibm);
            console.log('Successfully registered Lotus - secret:'+ secret_lotus);
            console.log('Successfully registered UBP - secret:'+ secret_ubp);

            return fabric_ca_client
                .enroll({enrollmentID: 'IBM', enrollmentSecret: secret_ibm})
                .then(()=>{
                    return fabric_ca_client
                        .enroll({enrollmentID: 'Lotus', enrollmentSecret: secret_lotus})
                        .then(()=>{
                            return fabric_ca_client
                                .enroll({enrollmentID: 'UBP', enrollmentSecret: secret_ubp});
                        })
                })

        })
        
        .then((enrollment) => {
        console.log('Successfully enrolled member users "IBM" , "Lotus" , "UBP" ');

        return fabric_client
            .createUser({username: 'IBM',mspid: 'Org1MSP',cryptoContent: { privateKeyPEM: enrollment.key.toBytes(), signedCertPEM: enrollment.certificate }})
            .then(()=>{
                return fabric_client
                    .createUser({username: 'Lotus',mspid: 'Org1MSP',cryptoContent: { privateKeyPEM: enrollment.key.toBytes(), signedCertPEM: enrollment.certificate }})
                    .then(()=>{
                        return fabric_client
                            .createUser({username: 'UBP',mspid: 'Org1MSP',cryptoContent: { privateKeyPEM: enrollment.key.toBytes(), signedCertPEM: enrollment.certificate }});
                    })
            })

        })
        
        .then((user) => {
            member_user_ibm = user;
            member_user_lotus= user;
            member_user_ubp = user;

            return fabric_client
                .setUserContext(member_user_ibm)
                .then(()=>{
                    return fabric_client
                        .setUserContext(member_user_lotus)
                        .then(()=>{
                            return fabric_client
                                .setUserContext(member_user_ubp);
                        })
                })

        })
        
        .then(()=>{
            console.log('3 users were successfully registered and enrolled and is ready to interact with the fabric network');

        })
        
        .catch((err) => {
            console.error('Failed to register: ' + err);
            if(err.toString().indexOf('Authorization') > -1) {
                console.error('Authorization failures may be caused by having admin credentials from a previous CA instance.\n' +
                'Try again after deleting the contents of the store directory '+store_path);
            }
        });
