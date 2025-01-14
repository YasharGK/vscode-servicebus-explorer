import fetch from 'node-fetch';
import parser from 'fast-xml-parser';
import { IServiceBusClient } from './IServiceBusClient';
import { ISubscription } from './models/ISubscriptionDetails';
import * as SBC from '@azure/service-bus';
import { ITopic } from './models/ITopicDetails';
import { IQueue } from './models/IQueueDetails';
import ServiceBusAuth, { IServiceBusAuthHeader } from '../common/serviceBusAuth';
import Long from 'long';

export default class ServiceBusClient implements IServiceBusClient {

    private serviceBusAuth: ServiceBusAuth;
    public get auth(): IServiceBusAuthHeader { return this.serviceBusAuth.getAuthHeader(); }
    public get hostName(): string { return this.serviceBusAuth.hostName; }

    constructor(private connectionString: string) {
        this.serviceBusAuth = new ServiceBusAuth(connectionString);
    }

    public async validateAndThrow(): Promise<void> {
        const { sasToken, endpoint } = this.auth;

        var result = await fetch(endpoint.replace('sb', 'https'), {
            method: 'GET',
            headers: { 'Authorization': sasToken },
        });

        var body = await result.text();
    }

    public getTopics(): Promise<ITopic[]> {
        return this.getEntities('GET', '/$resources/topics');
    }

    public getQueues(): Promise<IQueue[]> {
        return this.getEntities('GET', '/$resources/queues');
    }

    public getSubscriptions = (topicName: string): Promise<ISubscription[]> => {
        return this.getEntities('GET', `${topicName}/subscriptions`);
    }

    public getSubscriptionDetails = async (topic: string, subscription: string): Promise<ISubscription> => {
        const subDetail = await this.getEntity<ISubscription>('GET', `${topic}/subscriptions/${subscription}`);
        
        // Strip out the d3p1: from CountDetails members
        var leObject = subDetail.content.SubscriptionDescription.CountDetails as any;
        Object.keys(subDetail.content.SubscriptionDescription.CountDetails).map(x=>{
            leObject[x.substring(5)]= leObject[x];
        });
        //

        return subDetail;
    }

    public createSubscription = async (topic: string, subscription: string): Promise<ISubscription> => {
        const bodyContent = '<?xml version="1.0" encoding="utf-8" ?><entry xmlns="http://www.w3.org/2005/Atom"><content type="application/xml"><SubscriptionDescription xmlns="http://schemas.microsoft.com/netservices/2010/10/servicebus/connect"/></content></entry>';
        const result = await this.sendRequest('PUT', `${topic}/subscriptions/${subscription}`, bodyContent);
        return result.entry;
    }

    public deleteSubscription = async (topic: string, subscription: string): Promise<ISubscription> => {
        const result = await this.sendRequest('DELETE', `${topic}/subscriptions/${subscription}`);
        return result.entry;
    }

    public createTopic = async (topic: string): Promise<ITopic> => {
        const bodyContent = '<?xml version="1.0" encoding="utf-8" ?><entry xmlns="http://www.w3.org/2005/Atom"><content type="application/xml"><TopicDescription xmlns="http://schemas.microsoft.com/netservices/2010/10/servicebus/connect"/></content></entry>';
        const result = await this.sendRequest('PUT', `${topic}`, bodyContent);
        return result.entry;
    }

    public deleteTopic = async (topic: string): Promise<ITopic> => {
        const result = await this.sendRequest('DELETE', `${topic}`);
        return result.entry;
    }

    public createQueue = async (queue: string): Promise<IQueue> => {
        const bodyContent = '<?xml version="1.0" encoding="utf-8" ?><entry xmlns="http://www.w3.org/2005/Atom"><content type="application/xml"><QueueDescription xmlns="http://schemas.microsoft.com/netservices/2010/10/servicebus/connect"/></content></entry>';
        const result = await this.sendRequest('PUT', `${queue}`, bodyContent);
        return result.entry;
    }

    public deleteQueue = async (queue: string): Promise<IQueue> => {
        const result = await this.sendRequest('DELETE', `${queue}`);
        return result.entry;
    }

    public getMessages = async (topic: string, subscription: string, searchArguments: string | null): Promise<SBC.ReceivedMessageInfo[]> => {
        let messageReceiver;
        let client;

        try {
            client = SBC.ServiceBusClient.createFromConnectionString(this.connectionString);
            const subscriptionClient = client.createSubscriptionClient(topic, subscription);
            const messages = await subscriptionClient.peekBySequenceNumber(Long.MIN_VALUE, subscriptionClient === null ? 10 : 1000);



            await subscriptionClient.close();

            await client.close();
            if (searchArguments) {
                return messages.filter(x => x.messageId && x.messageId.toString().indexOf(searchArguments) >= 0);
            }
            else {
                return messages;
            }
        } catch{

            if (client) {
                await client.close();
            }

            return [];
        }
    }

    private async getEntity<T>(method: string, path: string): Promise<T> {
        const result = await this.sendRequest(method, path);
        return result.entry;
    }

    private async getEntities<T>(method: string, path: string): Promise<T[]> {
        const result = await this.sendRequest(method, path);

        if (result) {
            if (result.feed) {
                if (result.feed.entry) {
                    if (Array.isArray(result.feed.entry)) {
                        return result.feed.entry;
                    }

                    return [result.feed.entry];
                }
                else {
                    return [];
                }
            }
            else {
                return result;
            }
        }

        return [];
    }

    private async sendRequest(method: string, path: string, bodyContent: string | undefined = undefined): Promise<any> {
        const { sasToken, endpoint } = this.auth;

        var result = await fetch(endpoint.replace('sb', 'https') + path + '?api-version=2015-01', {
            method: method || 'GET',
            headers: {
                'Authorization': sasToken
            },
            body: bodyContent,
        });

        if (!result.ok) {
            var error = await result.text();
            return Promise.reject(error);
        }

        if (result.status === 204) { //NoResult Stats code
            return null;
        }

        const body = await result.text();
        const contentType = result.headers.get('content-type');

        if (contentType && contentType.includes('json')) {
            return JSON.parse(body);
        }
        else if (contentType && contentType.includes('xml')) {
            //WTF: some responses are actually JSON but content type comes as xml
            const xmlData = parser.parse(body);

            if (xmlData === "") {
                return JSON.parse(body);
            }

            return xmlData;
        }
        else {
            return body;
        }
    }

    public async sendMessage(topic: string, body: any, contentType: string): Promise<void> {
        let client;

        try {
            client = SBC.ServiceBusClient.createFromConnectionString(this.connectionString);
            const topicClient = client.createTopicClient(topic);

            const sender = topicClient.createSender();

            sender.send({
                body: body,
                contentType: contentType
            });


            await client.close();

        } catch{

            if (client) {
                await client.close();
            }
        }
    }

    public async purgeMessages(topic: string, subscription: string): Promise<void> {
        const client = SBC.ServiceBusClient.createFromConnectionString(this.connectionString);
        const subscriptionClient = client.createSubscriptionClient(topic, subscription);

        const receiver = subscriptionClient.createReceiver(SBC.ReceiveMode.receiveAndDelete);
        try {
            while(true)
            {
                const messages = await receiver.receiveMessages(100, 10);
                if(messages.length == 0)
                {
                    break;
                }
            }
        }
        catch (err) {
            console.log(err);
        }
        finally {
            await receiver.close();
        }
    }
}