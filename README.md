# miluxas-chatnet2



Chat network backend on Hyperledger Fabric Blockchain Platform

This code pattern demonstrates setting up a network on the Hyperledger Fabric Blockchain Platform and deploying the chat system on the network. Next, we setup our application to interact with the network including identities to submit transactions on the network. The application is setup with a Node.js server using the Fabric Node SDK to process requests to the network.

For install prerequest :
https://hyperledger.github.io/composer/v0.19/installing/installing-prereqs.html


Installing the development environment :
https://hyperledger.github.io/composer/v0.19/installing/development-tools.html


Clone this repository

For run this project 

$ composer archive create -t dir -n .

$ composer network install --card PeerAdmin@hlfv1 --archiveFile miluxas-chatnet2@0.0.1.bna

$ composer network start --networkName miluxas-chatnet2 --networkVersion 0.0.1 --networkAdmin admin --networkAdminEnrollSecret adminpw --card PeerAdmin@hlfv1 --file networkadmin.card

$ composer card import --file networkadmin.card

$ composer-rest-server



License

This code pattern is licensed under the Apache Software License, Version 2. Separate third-party code objects invoked within this code pattern are licensed by their respective providers pursuant to their own separate licenses. Contributions are subject to the Developer Certificate of Origin, Version 1.1 (DCO) and the Apache Software License, Version 2.

Apache Software License (ASL) FAQ
