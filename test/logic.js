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

const namespace = 'org.miluxas.BlockchainBase';
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
        const assetRegistry = await businessNetworkConnection.getAssetRegistry('org.miluxas.BlockchainBase.Chat');
        const asset1 = await assetRegistry.get('32556');

        // Validate the asset.
        asset1.title.should.equal('first solivan chat');
        const chatNetRegistry=await businessNetworkConnection.getAssetRegistry('org.miluxas.BlockchainBase.ChatNet');
        const chatNetAsset=await chatNetRegistry.get('mainchatnetid001');

        chatNetAsset.chatList[0].chatId.should.equal('32556');


        const memberRegistry = await businessNetworkConnection.getAssetRegistry('org.miluxas.BlockchainBase.Member');
        const member = await memberRegistry.get(events[0].newMember.getIdentifier());
        member.user.getIdentifier().should.equal('solivan@email.com');
        const member2 = await memberRegistry.get(events[1].newMember.getIdentifier());
        member2.user.getIdentifier().should.equal('ferzin@email.com');
        //let ev=events[0];
        //console.log(ev);
    });
});
