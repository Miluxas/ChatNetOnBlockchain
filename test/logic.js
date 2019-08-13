/*
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';
/**
 * Write the unit tests for your transction processor functions here
 */

const AdminConnection = require('composer-admin').AdminConnection;
const BusinessNetworkConnection = require('composer-client').BusinessNetworkConnection;
const { BusinessNetworkDefinition, CertificateUtil, IdCard } = require('composer-common');
const path = require('path');

const chai = require('chai');
chai.should();
chai.use(require('chai-as-promised'));

const namespace = 'org.miluxas.chatnet2';
const participantType = 'User';
const participantNS = namespace + '.' + participantType;

describe('#' + namespace, () => {
    // In-memory card store for testing so cards are not persisted to the file system
    const cardStore = require('composer-common').NetworkCardStoreManager.getCardStore( { type: 'composer-wallet-inmemory' } );

    // Embedded connection used for local testing
    const connectionProfile = {
        name: 'embedded',
        'x-type': 'embedded'
    };

    // Name of the business network card containing the administrative identity for the business network
    const adminCardName = 'admin';

    // Admin connection to the blockchain, used to deploy the business network
    let adminConnection;

    // This is the business network connection the tests will use.
    let businessNetworkConnection;

    // This is the factory for creating instances of types.
    let factory;

    // These are the identities for Solivan and Ferzin.
    const solivanCardName = 'solivan';
    const ferzinCardName = 'ferzin';

    // These are a list of receieved events.
    let events;

    let businessNetworkName;

    before(async () => {
        // Generate certificates for use with the embedded connection
        const credentials = CertificateUtil.generate({ commonName: 'admin' });

        // Identity used with the admin connection to deploy business networks
        const deployerMetadata = {
            version: 1,
            userName: 'PeerAdmin',
            roles: [ 'PeerAdmin', 'ChannelAdmin' ]
        };
        const deployerCard = new IdCard(deployerMetadata, connectionProfile);
        deployerCard.setCredentials(credentials);
        const deployerCardName = 'PeerAdmin';

        adminConnection = new AdminConnection({ cardStore: cardStore });

        await adminConnection.importCard(deployerCardName, deployerCard);
        await adminConnection.connect(deployerCardName);
    });

    /**
     *
     * @param {String} cardName The card name to use for this identity
     * @param {Object} identity The identity details
     */
    async function importCardForIdentity(cardName, identity) {
        const metadata = {
            userName: identity.userID,
            version: 1,
            enrollmentSecret: identity.userSecret,
            businessNetwork: businessNetworkName
        };
        const card = new IdCard(metadata, connectionProfile);
        await adminConnection.importCard(cardName, card);
    }

    // This is called before each test is executed.
    beforeEach(async () => {
        // Generate a business network definition from the project directory.
        let businessNetworkDefinition = await BusinessNetworkDefinition.fromDirectory(path.resolve(__dirname, '..'));
        businessNetworkName = businessNetworkDefinition.getName();
        await adminConnection.install(businessNetworkDefinition);
        const startOptions = {
            networkAdmins: [
                {
                    userName: 'admin',
                    enrollmentSecret: 'adminpw'
                }
            ]
        };
        const adminCards = await adminConnection.start(businessNetworkName, businessNetworkDefinition.getVersion(), startOptions);
        await adminConnection.importCard(adminCardName, adminCards.get('admin'));

        // Create and establish a business network connection
        businessNetworkConnection = new BusinessNetworkConnection({ cardStore: cardStore });
        events = [];
        businessNetworkConnection.on('event', event => {
            events.push(event);
        });
        await businessNetworkConnection.connect(adminCardName);

        // Get the factory for the business network.
        factory = businessNetworkConnection.getBusinessNetwork().getFactory();

        const participantRegistry = await businessNetworkConnection.getParticipantRegistry(participantNS);
        // Create the participants.
        const solivan = factory.newResource(namespace, participantType, 'solivan@email.com');
        solivan.firstName = 'Solivan';
        solivan.lastName = 'A';

        const ferzin = factory.newResource(namespace, participantType, 'ferzin@email.com');
        ferzin.firstName = 'Ferzin';
        ferzin.lastName = 'B';

        await participantRegistry.addAll([solivan, ferzin]);

        // Issue the identities.
        let identity = await businessNetworkConnection.issueIdentity(participantNS + '#solivan@email.com', 'solivan1');
        await importCardForIdentity(solivanCardName, identity);
        identity = await businessNetworkConnection.issueIdentity(participantNS + '#ferzin@email.com', 'ferzin1');
        await importCardForIdentity(ferzinCardName, identity);

        const chatNetAssetRegistry = await businessNetworkConnection.getAssetRegistry(namespace + '.ChatNet');
        const chatNetAsset=factory.newResource(namespace,'ChatNet','mainchatnetid001');
        chatNetAsset.name='Main Chat Network 001';
        chatNetAsset.chatList = new Array();
        await chatNetAssetRegistry.add(chatNetAsset);

    });

    /**
     * Reconnect using a different identity.
     * @param {String} cardName The name of the card for the identity to use
     */
    async function useIdentity(cardName) {
        //await businessNetworkConnection.disconnect();
        businessNetworkConnection = new BusinessNetworkConnection({ cardStore: cardStore });
        events = [];
        businessNetworkConnection.on('event', (event) => {
            events.push(event);
        });
        await businessNetworkConnection.connect(cardName);
        factory = businessNetworkConnection.getBusinessNetwork().getFactory();
    }

    /**
     * Submit create new chat transaction
     * @param {String} newChatId New chat Id
     * @param {String} newChatTitle New chat title
     * @param {String} newChatType New chat type
     */
    async function createNewChat(newChatId,newChatTitle,newChatType){
        const transaction = factory.newTransaction(namespace, 'StartNewGroupChat');
        transaction.chatNetId = 'mainchatnetid001';
        transaction.newChatId = newChatId;
        transaction.newChatTitle = newChatTitle;
        transaction.type=newChatType;
        await businessNetworkConnection.submitTransaction(transaction);
    }


    it('Solivan can submit a transaction for start new peer chat', async () => {
        // Use the identity for Solivan.
        await useIdentity(solivanCardName);

        // Submit the transaction.
        const transaction = factory.newTransaction(namespace, 'StartNewPeerChat');
        transaction.chatNetId = 'mainchatnetid001';
        transaction.newChatId = '32556';
        transaction.newChatTitle = 'first solivan chat';
        transaction.peerUser=factory.newRelationship(namespace, 'User', 'ferzin@email.com');
        await businessNetworkConnection.submitTransaction(transaction);


        // Get the asset.
        const assetRegistry = await businessNetworkConnection.getAssetRegistry('org.miluxas.chatnet2.Chat');
        const asset1 = await assetRegistry.get('32556');

        // Validate the asset.
        asset1.title.should.equal('first solivan chat');
        const chatNetRegistry=await businessNetworkConnection.getAssetRegistry('org.miluxas.chatnet2.ChatNet');
        const chatNetAsset=await chatNetRegistry.get('mainchatnetid001');

        chatNetAsset.chatList[0].chatId.should.equal('32556');


        const memberRegistry = await businessNetworkConnection.getAssetRegistry('org.miluxas.chatnet2.Member');
        const member = await memberRegistry.get(events[0].newMember.getIdentifier());
        member.user.getIdentifier().should.equal('solivan@email.com');
        const member2 = await memberRegistry.get(events[1].newMember.getIdentifier());
        member2.user.getIdentifier().should.equal('ferzin@email.com');
        //let ev=events[0];
        //console.log(ev);
    });
    /*
    it('Solivan can submit a transaction for start new group chat', async () => {
        // Use the identity for Solivan.
        await useIdentity(solivanCardName);

        await createNewChat('32556','first solivan group chat','PUBLIC_GROUP');


        // Get the asset.
        const assetRegistry = await businessNetworkConnection.getAssetRegistry('org.miluxas.chatnet2.Chat');
        const asset1 = await assetRegistry.get('32556');

        // Validate the asset.
        asset1.title.should.equal('first solivan group chat');
        const chatNetRegistry=await businessNetworkConnection.getAssetRegistry('org.miluxas.chatnet2.ChatNet');
        const chatNetAsset=await chatNetRegistry.get('mainchatnetid001');

        chatNetAsset.chatList[0].chatId.should.equal('32556');
    });

    it('Solivan can submit a transaction for add message to chat', async () => {
        // Use the identity for Solivan.
        await useIdentity(solivanCardName);

        await createNewChat('32556','first solivan group chat','PUBLIC_GROUP');

        //await useIdentity(ferzinCardName);
        // Create message
        const messageAssetRegistery = await businessNetworkConnection.getAssetRegistry(namespace+'.Message');
        let newMessageId= '56554fmmdi154';
        const newMessage = factory.newResource(namespace, 'Message',newMessageId);
        newMessage.content='first message';
        newMessage.createAt=new Date();
        newMessage.owner =factory.newRelationship(namespace, 'User', 'solivan@email.com');
        await messageAssetRegistery.add(newMessage);

        // Submit add message to chat transaction
        const transaction2 = factory.newTransaction(namespace, 'SendMessageToChat');
        transaction2.chat =factory.newRelationship(namespace, 'Chat', '32556');
        transaction2.message =factory.newRelationship(namespace, 'Message', newMessageId);
        await businessNetworkConnection.submitTransaction(transaction2);

        // Get the asset.
        const assetRegistry = await businessNetworkConnection.getAssetRegistry('org.miluxas.chatnet2.Chat');
        const asset1 = await assetRegistry.get('32556');

        // Validate the asset.
        asset1.title.should.equal('first solivan group chat');
        asset1.messageList[0].content.should.equal('first message');
        //console.log(asset1);
        const chatNetRegistry=await businessNetworkConnection.getAssetRegistry('org.miluxas.chatnet2.ChatNet');
        const chatNetAsset=await chatNetRegistry.get('mainchatnetid001');

        chatNetAsset.chatList[0].chatId.should.equal('32556');
    });

    it('Ferzin can not submit a transaction for add message to chat that is not a member of it', async () => {
        // Use the identity for Solivan.
        await useIdentity(solivanCardName);

        await createNewChat('32556','first solivan group chat','PUBLIC_GROUP');

        await useIdentity(ferzinCardName);
        // Create message
        const messageAssetRegistery = await businessNetworkConnection.getAssetRegistry(namespace+'.Message');
        let newMessageId= '56554fmmdi154';
        const newMessage = factory.newResource(namespace, 'Message',newMessageId);
        newMessage.content='first message';
        newMessage.createAt=new Date();
        newMessage.owner =factory.newRelationship(namespace, 'User', 'ferzin@email.com');
        await messageAssetRegistery.add(newMessage);

        // Submit add message to chat transaction
        const transaction2 = factory.newTransaction(namespace, 'SendMessageToChat');
        transaction2.chat =factory.newRelationship(namespace, 'Chat', '32556');
        transaction2.message =factory.newRelationship(namespace, 'Message', newMessageId);
        await businessNetworkConnection.submitTransaction(transaction2);

        // Get the asset.
        const assetRegistry = await businessNetworkConnection.getAssetRegistry('org.miluxas.chatnet2.Chat');
        const asset1 = await assetRegistry.get('32556');

        // Validate the asset.
        asset1.title.should.equal('first solivan group chat');
        asset1.messageList[0].content.should.equal('first message');
        //console.log(asset1);
        const chatNetRegistry=await businessNetworkConnection.getAssetRegistry('org.miluxas.chatnet2.ChatNet');
        const chatNetAsset=await chatNetRegistry.get('mainchatnetid001');

        chatNetAsset.chatList[0].chatId.should.equal('32556');
    });

    it('Ferzin can join to public group that Solivan create it', async () => {
        // Use the identity for Solivan.
        await useIdentity(solivanCardName);

        await createNewChat('32556','first solivan group chat','PUBLIC_GROUP');

        await useIdentity(ferzinCardName);

        // Submit add message to chat transaction
        const transaction2 = factory.newTransaction(namespace, 'JoinToChat');
        transaction2.chat =factory.newRelationship(namespace, 'Chat', '32556');
        await businessNetworkConnection.submitTransaction(transaction2);

        // Get the asset.
        const assetRegistry = await businessNetworkConnection.getAssetRegistry('org.miluxas.chatnet2.Chat');
        const asset1 = await assetRegistry.get('32556');

        // Validate the asset.
        asset1.title.should.equal('first solivan group chat');
        //console.log(asset1.memberList[1]);
        asset1.memberList[1].user.getIdentifier().should.equal('ferzin@email.com');

        const chatNetRegistry=await businessNetworkConnection.getAssetRegistry('org.miluxas.chatnet2.ChatNet');
        const chatNetAsset=await chatNetRegistry.get('mainchatnetid001');

        chatNetAsset.chatList[0].chatId.should.equal('32556');
    });

    it('Ferzin can not join to public group that he is member of it', async () => {
        // Use the identity for Solivan.
        await useIdentity(solivanCardName);

        await createNewChat('32556','first solivan group chat','PRIVATE_GROUP');

        await useIdentity(ferzinCardName);

        // Submit add message to chat transaction
        const transaction2 = factory.newTransaction(namespace, 'JoinToChat');
        transaction2.chat =factory.newRelationship(namespace, 'Chat', '32556');
        await businessNetworkConnection.submitTransaction(transaction2);
        await businessNetworkConnection.submitTransaction(transaction2);

        // Get the asset.
        const assetRegistry = await businessNetworkConnection.getAssetRegistry('org.miluxas.chatnet2.Chat');
        const asset1 = await assetRegistry.get('32556');

        // Validate the asset.
        asset1.title.should.equal('first solivan group chat');
        //console.log(asset1.memberList[1]);
        asset1.memberList[1].user.getIdentifier().should.equal('ferzin@email.com');

        const chatNetRegistry=await businessNetworkConnection.getAssetRegistry('org.miluxas.chatnet2.ChatNet');
        const chatNetAsset=await chatNetRegistry.get('mainchatnetid001');

        chatNetAsset.chatList[0].chatId.should.equal('32556');
    });

    it('Solivan create a group chat and add Ferzin to it', async () => {
        // Use the identity for Solivan.
        await useIdentity(solivanCardName);

        await createNewChat('32556','first solivan group chat','PRIVATE_GROUP');

        // Submit add other user to chat transaction
        const transaction2 = factory.newTransaction(namespace, 'AddOtherUserToChat');
        transaction2.chat = factory.newRelationship(namespace, 'Chat', '32556');
        transaction2.otherUser = factory.newRelationship(namespace, 'User', 'ferzin@email.com');
        await businessNetworkConnection.submitTransaction(transaction2);

        // Get the asset. and check if Ferzin added to chat
        const assetRegistry = await businessNetworkConnection.getAssetRegistry('org.miluxas.chatnet2.Chat');
        const asset1 = await assetRegistry.get('32556');
        //console.log(asset1.memberList[1]);
        asset1.memberList[1].user.getIdentifier().should.equal('ferzin@email.com');
    });

    it('Solivan create a group chat and Ferzin join to it then Solivan expel him', async () => {
        // Use the identity for Solivan.
        await useIdentity(solivanCardName);

        await createNewChat('32556','first solivan group chat','PUBLIC_GROUP');

        await useIdentity(ferzinCardName);

        // Submit join to chat transaction
        const transaction = factory.newTransaction(namespace, 'JoinToChat');
        transaction.chat =factory.newRelationship(namespace, 'Chat', '32556');
        await businessNetworkConnection.submitTransaction(transaction);

        await useIdentity(solivanCardName);

        // Get the asset. and check if Ferzin added to chat
        const assetRegistry = await businessNetworkConnection.getAssetRegistry('org.miluxas.chatnet2.Chat');
        const asset1 = await assetRegistry.get('32556');

        // Submit add other user to chat transaction
        const transaction33 = factory.newTransaction(namespace, 'ExpelMemberFromChat');
        transaction33.chat = factory.newRelationship(namespace, 'Chat', '32556');
        transaction33.member = factory.newRelationship(namespace, 'Member', asset1.memberList[1].getIdentifier());
        await businessNetworkConnection.submitTransaction(transaction33);

        const asset2 = await assetRegistry.get('32556');
        asset2.memberList[1].status.should.equal('EXPELED');
    });


    it('Solivan create a group chat and Ferzin join to it then Ferzin leave it', async () => {
        // Use the identity for Solivan.
        await useIdentity(solivanCardName);

        await createNewChat('32556','first solivan group chat','PUBLIC_GROUP');

        await useIdentity(ferzinCardName);

        // Submit join to chat transaction
        const transaction = factory.newTransaction(namespace, 'JoinToChat');
        transaction.chat =factory.newRelationship(namespace, 'Chat', '32556');
        await businessNetworkConnection.submitTransaction(transaction);

        // Get the asset. and check if Ferzin added to chat
        const assetRegistry = await businessNetworkConnection.getAssetRegistry('org.miluxas.chatnet2.Chat');

        // Submit add other user to chat transaction
        const transaction33 = factory.newTransaction(namespace, 'LeaveChat');
        transaction33.chat = factory.newRelationship(namespace, 'Chat', '32556');
        await businessNetworkConnection.submitTransaction(transaction33);

        const asset2 = await assetRegistry.get('32556');
        asset2.memberList[1].status.should.equal('LEFT');
    });

    it('Solivan create a group chat and Ferzin join to it add message and delete message', async () => {
        // Use the identity for Solivan.
        await useIdentity(solivanCardName);

        await createNewChat('32556','first solivan group chat','PUBLIC_GROUP');

        await useIdentity(ferzinCardName);
        const assetRegistry = await businessNetworkConnection.getAssetRegistry('org.miluxas.chatnet2.Chat');

        // Submit join to chat transaction
        const transaction = factory.newTransaction(namespace, 'JoinToChat');
        transaction.chat =factory.newRelationship(namespace, 'Chat', '32556');
        await businessNetworkConnection.submitTransaction(transaction);

        // Create message
        const messageAssetRegistery = await businessNetworkConnection.getAssetRegistry(namespace+'.Message');
        let newMessageId= '56554fmmdi154';
        const newMessage = factory.newResource(namespace, 'Message',newMessageId);
        newMessage.content='first message';
        newMessage.createAt=new Date();
        newMessage.owner =factory.newRelationship(namespace, 'User', 'ferzin@email.com');
        await messageAssetRegistery.add(newMessage);

        // Submit add message to chat transaction
        const transaction2 = factory.newTransaction(namespace, 'SendMessageToChat');
        transaction2.chat =factory.newRelationship(namespace, 'Chat', '32556');
        transaction2.message =factory.newRelationship(namespace, 'Message', newMessageId);
        await businessNetworkConnection.submitTransaction(transaction2);

        const chatAsset = await assetRegistry.get('32556');
        chatAsset.messageList.length.should.equal(1);

        // Submit remove message from chat transaction
        const transaction3 = factory.newTransaction(namespace, 'DeleteMessage');
        transaction3.chat =factory.newRelationship(namespace, 'Chat', '32556');
        transaction3.message =factory.newRelationship(namespace, 'Message', newMessageId);
        await businessNetworkConnection.submitTransaction(transaction3);

        let ev=events[0];
        console.log(ev);

        const asset2 = await assetRegistry.get('32556');
        asset2.messageList.length.should.equal(0);
    });

    /*it('test chat', async () => {
        // Use the identity for Solivan.
        await useIdentity(solivanCardName);

        await createNewChat('32556','first solivan group chat','PUBLIC_GROUP');

        // Get the asset. and check if Ferzin added to chat
        const assetRegistry = await businessNetworkConnection.getAssetRegistry('org.miluxas.chatnet2.Chat');
        const asset1 = await assetRegistry.get('32556');

        // Submit add other user to chat transaction
        const transaction33 = factory.newTransaction(namespace, 'TestOnChat');
        transaction33.chat = factory.newRelationship(namespace, 'Chat', '32556');
        await businessNetworkConnection.submitTransaction(transaction33);
        var asset2 = await assetRegistry.get('32556');

        //console.log(asset1.type);
        asset2.title.should.equal('PRIVATE_CANNAL');
    });*/


});
