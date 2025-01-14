import vscode from 'vscode';
import { Subscription } from '../subscription/subscription';
import { IServiceBusClient } from '../client/IServiceBusClient';
import { MessageStoreInstance } from '../common/global';
import { ReceivedMessageInfo } from '@azure/service-bus';

export class MessageWebView {

    private panel: vscode.WebviewPanel | undefined;

    constructor(
        private client: IServiceBusClient,
        public readonly node: Subscription) {
    }

    async getMessages(topic: string, subscription: string, searchArguments: string | null): Promise<ReceivedMessageInfo[]> {
        return await this.client.getMessages(topic, subscription, searchArguments);
    }

    async renderMessages(topic: string, subscription: string, messages: any[]): Promise<void> {
        if (!this.panel) {
            return;
        }

        const messageTable: string =
            messages.length > 0 ?
                messages.map(x => {
                    MessageStoreInstance.setMessage(x.messageId, x);
                    return `
                    <tr>
                        <td data-message-id="${x.messageId}">
                            ${x.messageId}
                        </td>
                        <td data-content-type="${x.contentType || ''}">
                            ${x.contentType || ''}
                        </td>
                        <td data-content-type="${x.label || ''}">
                            ${x.label || ''}
                        </td>
                        <td data-content-type="${x.enqueuedSequenceNumber || ''}">
                            ${x.enqueuedSequenceNumber || ''}
                        </td>
                        <td>
                            ${ x.enqueuedTimeUtc.toLocaleString() || ''}
                        </td>
                        <td>
                            <button class="button" onclick="showMessage('${topic}', '${subscription}', '${x.messageId}')">Open</button>
                        </td>
                    </tr>
                `;
                })
                    .reduce((p, c) => p += c, '')
                :
                `
                <tr>
                    <td>
                        No messages found
                    </td>
                </tr>
                `
            ;



        this.panel.webview.html = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Message List</title>
                <style>

                    input {
                        box-sizing: border-box;
                    }

                    .button{
                        color: var(--vscode-button-foreground);
                        background-color: var(--vscode-button-background);
                        padding: 1rem 2rem 1rem 2rem;
                        border: none;
                    }

                    .button:hover:{
                        background-color: var(--vscode-button-hoverBackground);
                    }

                    .input{
                        background-color: var(--vscode-input-background);
                        border: var(--vscode-input-border);
                        color: var(--vscode-input-foreground);
                        width: calc(100% - 2rem);
                        padding: 0.5rem 0.8rem 0.5rem 0.8rem;
                        margin: 0px;
                    }


                    .hidden{
                        display:none;
                    }

                </style>
            </head>
            <body>
                    <h1>Messages (${subscription})</h1>
                    <script >
                        const vscode = acquireVsCodeApi();
                        function showMessage(topic, subscription, messageId){
                            vscode.postMessage({
                                command: 'serviceBusExplorer.showMessage',
                                topic: topic,
                                subscription: subscription,
                                messageId: messageId
                            })
                        }

                        function filter(){
                            var messageId = filter_messageId.value;
                            
                            var nodesToHide = [];
                            var nodesToShow = [];
                            if(!messageId || messageId.length === 0){
                                nodesToShow = document.querySelectorAll('td[data-message-id]');
                            }
                            else{
                                nodesToHide = document.querySelectorAll('td:not([data-message-id="' + messageId + '"])');
                                nodesToShow = document.querySelectorAll('td[data-message-id="' + messageId + '"]');    
                            }
                          
                            nodesToHide.forEach(function(x) {
                              
                              x.parentNode.classList.add('hidden');
                            });
                            
                            nodesToShow.forEach(function(x) { 
                              x.parentNode.classList.remove('hidden');
                            });
                        }

                    </script>
                    <table style="width:100%" >
                        <thead>
                            <tr>
                                <th style="text-align:left">
                                    Message Id
                                </th>
                                <th style="text-align:left">
                                    Content Type
                                </th>
                                <th style="text-align:left">
                                    Label
                                </th>
                                <th style="text-align:left">
                                    Enqueued Sequencenumber
                                </th>
                                <th style="text-align:left">
                                    TimeStamp
                                </th>
                                <th>
                                </th>
                            </tr>
                            <tr>
                                <th style="text-align:left">
                                   <input id="filter_messageId" class="input" onchange="filter()" /> 
                                </th>
                                <th style="text-align:left">
                                    <input id="filter_contentType" class="input" onchange="filter()" /> 
                                </th>
                                <th style="text-align:left">
                                    <input id="filter_label" class="input" onchange="filter()" /> 
                                </th>
                                <th>
                                </th>
                                <th>
                                </th>
                                <th>
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            ${messageTable}
                        </tbody>
                    </table>
                </body>
                
        `;

    }

    async open(context: vscode.ExtensionContext, searchArguments: string | null): Promise<void> {

        const messages = await this.getMessages(this.node.topicName, this.node.label, searchArguments);

        this.panel = vscode.window.createWebviewPanel(
            'messagelist', // Identifies the type of the webview. Used internally
            `${this.node.topicName} - (${this.node.label})`, // Title of the panel displayed to the user
            vscode.ViewColumn.One, // Editor column to show the new webview panel in.
            {
                enableScripts: true
            }
        );

        this.panel.webview.onDidReceiveMessage(
            message => {
                var msg = messages.find(x => x.messageId === message.messageId);

                switch (message.command) {
                    case 'serviceBusExplorer.showMessage':
                        vscode.commands.executeCommand('serviceBusExplorer.showMessage', message.topic, message.subscription, msg);
                        return;
                }
            },
            undefined,
            context.subscriptions
        );

        await this.renderMessages(this.node.topicName, this.node.label, messages);

        this.panel.onDidDispose(() => {

        }, null, context.subscriptions);
    }
}