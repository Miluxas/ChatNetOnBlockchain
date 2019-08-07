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
 *
 */
function create_UUID(){
    var dt = new Date().getTime();
    var uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = (dt + Math.random()*16)%16 | 0;
        dt = Math.floor(dt/16);
        return (c==='x' ? r :(r&0x3|0x8)).toString(16);
    });
    return uuid;
}

/**
 * Send message to a chat
 * @param {org.miluxas.chatnet2.SendMessageToChat} sendMessageToChat
 * @transaction
 */
async function sendMessageToChat(tx){
    const chatAssetRegistry = await getAssetRegistry('org.miluxas.chatnet2.Chat');
    let chat=tx.chat;
    chat.messageList.push(tx.message);
    await chatAssetRegistry.update(chat);
}

/**
 * StartNewPeerChat transaction
 * @param {org.miluxas.chatnet2.StartNewPeerChat} startNewPeerChat
 * @transaction
 */
async function startNewPeerChat(tx) {
    const factory = getFactory();
    const namespace = 'org.miluxas.chatnet2';

    // load the chat network.
    const chatNetAssetRegistry = await getAssetRegistry('org.miluxas.chatnet2.ChatNet');
    const mainChatNet=await chatNetAssetRegistry.get('mainchatnetid001');

    // create a chat.
    const chatAssetRegistry = await getAssetRegistry('org.miluxas.chatnet2.Chat');
    const newChat = factory.newResource(namespace, 'Chat', tx.newChatId);
    newChat.title = tx.newChatTitle;
    newChat.createAt=new Date();
    newChat.type='PEER';
    newChat.memberList=[];
    newChat.messageList=[];

    // create new member as owner.
    const memberAssetRegistry = await getAssetRegistry('org.miluxas.chatnet2.Member');
    const adminMember = factory.newResource(namespace,'Member',create_UUID());
    adminMember.type='OWNER';
    adminMember.addedAt=new Date();
    adminMember.status='NORMAL';
    adminMember.user=factory.newRelationship(namespace, 'User', getCurrentParticipant().getIdentifier());
    await memberAssetRegistry.add(adminMember);
    newChat.memberList.push(adminMember);

    // create new member as peer.
    const peerMember = factory.newResource(namespace,'Member',create_UUID());
    peerMember.type='NORMAL';
    peerMember.addedAt=new Date();
    peerMember.status='NORMAL';
    peerMember.user=factory.newRelationship(namespace, 'User', tx.peerUser.getIdentifier());
    await memberAssetRegistry.add(peerMember);
    newChat.memberList.push(peerMember);

    await chatAssetRegistry.add(newChat).catch(er=>{
        console.log(er);
    });

    // add chat to chat network.
    mainChatNet.chatList.push(newChat);
    await chatNetAssetRegistry.update(mainChatNet);


    // Emit an event for the modified asset.
    /*let event = getFactory().newEvent('org.miluxas.chatnet2', 'SampleEvent');
    event.asset = tx.asset;
    event.oldValue = oldValue;
    event.newValue = tx.newValue;
    emit(event);*/
}

/**
 * StartNewGroupChat transaction
 * @param {org.miluxas.chatnet2.StartNewGroupChat} startNewGroupChat
 * @transaction
 */
async function startNewGroupChat(tx) {
    const factory = getFactory();
    const namespace = 'org.miluxas.chatnet2';

    // load the chat network.
    const chatNetAssetRegistry = await getAssetRegistry('org.miluxas.chatnet2.ChatNet');
    const mainChatNet=await chatNetAssetRegistry.get('mainchatnetid001');

    // create a chat.
    const chatAssetRegistry = await getAssetRegistry('org.miluxas.chatnet2.Chat');
    const newChat = factory.newResource(namespace, 'Chat', tx.newChatId);
    newChat.title = tx.newChatTitle;
    newChat.createAt=new Date();
    newChat.type=tx.type;
    newChat.memberList=[];
    newChat.messageList=[];

    // create new member as owner.
    const memberAssetRegistry = await getAssetRegistry('org.miluxas.chatnet2.Member');
    const adminMember = factory.newResource(namespace,'Member',create_UUID());
    adminMember.type='OWNER';
    adminMember.addedAt=new Date();
    adminMember.status='NORMAL';
    adminMember.user=factory.newRelationship(namespace, 'User', getCurrentParticipant().getIdentifier());
    await memberAssetRegistry.add(adminMember);
    newChat.memberList.push(adminMember);
    //console.log(newChat.memberList);
    await chatAssetRegistry.add(newChat).catch(er=>{
        console.log(er);
    });

    // add chat to chat network.
    mainChatNet.chatList.push(newChat);
    await chatNetAssetRegistry.update(mainChatNet);

    // Emit an event for the modified asset.
    /*let event = getFactory().newEvent('org.miluxas.chatnet2', 'SampleEvent');
    event.asset = tx.asset;
    event.oldValue = oldValue;
    event.newValue = tx.newValue;
    emit(event);*/
}

/**
 * Send join to chat request
 * @param {org.miluxas.chatnet2.JoinToChat} joinToChat
 * @transaction
 */
async function joinToChat(tx){
    const factory = getFactory();
    const namespace = 'org.miluxas.chatnet2';
    // create new member.
    const memberAssetRegistry = await getAssetRegistry('org.miluxas.chatnet2.Member');
    const newMember = factory.newResource(namespace,'Member',create_UUID());
    newMember.type='NORMAL';
    newMember.addedAt=new Date();
    if(tx.chat.type==='PUBLIC_GROUP' || tx.chat.type==='PUBLIC_CANNAL'){
        newMember.status='NORMAL';
    }
    if(tx.chat.type==='PRIVATE_GROUP' || tx.chat.type==='PRIVATE_CANNAL'){
        newMember.status='REQUESTED';
    }
    newMember.user=factory.newRelationship(namespace, 'User', getCurrentParticipant().getIdentifier());
    await memberAssetRegistry.add(newMember);

    const chatAssetRegistry = await getAssetRegistry('org.miluxas.chatnet2.Chat');
    let chat=tx.chat;
    chat.memberList.push(newMember);
    await chatAssetRegistry.update(chat);
}
