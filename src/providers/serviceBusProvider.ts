import * as vscode from 'vscode';

// Sdk for JS does not have the management api yet
// https://github.com/Azure/azure-sdk-for-js/issues/3116
//import * as ServiceBus from '@azure/service-bus';

import ServiceBusClient from '../client/ServiceBusClient';
import { ExplorerItemBase, IItemData } from '../common/explorerItemBase';
import { NameSpaceItem } from '../namespace/namespaceItem';
import { NAMESPACE_CONNECTIONS } from '../common/global';
import { TopicList } from '../topic/topicList';
import { QueueList } from '../queue/queueList';
import { Topic } from '../topic/topic';
import { Queue } from '../queue/queue';
import { Subscription } from '../topic/subscription';
import { ISubscription } from '../client/models/ISubscriptionDetails';
import { ITopic } from '../client/models/ITopicDetails';
import { IQueue } from '../client/models/IQueueDetails';

export class ServiceBusProvider implements vscode.TreeDataProvider<ExplorerItemBase> {

	private _onDidChangeTreeData: vscode.EventEmitter<ExplorerItemBase | undefined> = new vscode.EventEmitter<ExplorerItemBase | undefined>();
	readonly onDidChangeTreeData: vscode.Event<ExplorerItemBase | undefined> = this._onDidChangeTreeData.event;

	state: vscode.Memento;

	constructor(context: vscode.ExtensionContext) {
		this.state = context.workspaceState;
		this.reBuildTree();
	}

	public getTreeItem(element: ExplorerItemBase): vscode.TreeItem {
		return element;
	}

	public getChildren(element?: ExplorerItemBase): Thenable<ExplorerItemBase[]> {
		//On undefined we get the namespaces
		if (!element) {
			var connections = this.state.get<IItemData[]>(NAMESPACE_CONNECTIONS, []);
			return Promise.resolve(
				[
					...connections.map(c => new NameSpaceItem(c, vscode.TreeItemCollapsibleState.Expanded))
				]
			);
		}
		else if (element instanceof NameSpaceItem) {

			var topics: Promise<ITopic[]> = Promise.resolve([]);
			var queues: Promise<IQueue[]> = Promise.resolve([]);

			if (element.data.clientInstance && !element.data.error) {
				topics = element.data.clientInstance.getTopics();
				queues = element.data.clientInstance.getQueues();
			}

			return Promise.all([queues, topics])
				.then(x => [
					new QueueList(element.data, vscode.TreeItemCollapsibleState.Collapsed, x[0].length || 0),
					new TopicList(element.data, vscode.TreeItemCollapsibleState.Collapsed, x[1].length || 0)
				]
				);
		}
		else if (element instanceof TopicList) {
			if (element.itemData.clientInstance) {
				return element.itemData.clientInstance.getTopics()
					.then(x => x.map(y =>
						new Topic(element.itemData, y.title)
					));
			}
		}
		else if (element instanceof Topic) {
			//TODO: Someone implement this please
			if (element.itemData.clientInstance) {
				const mapToSubscription = async (subs: any[]): Promise<Subscription[]> => {

					subs = subs.map(async (y: { title: string; }) => {
						if (element.itemData.clientInstance) {
							const subDetails: ISubscription = await element.itemData.clientInstance.getSubscriptionDetails(element.label || '', y.title);
							return new Subscription(element.itemData, subDetails, element.label || '');
						}
						return null;
					});

					return Promise.all(subs);
				};
				//TODO: Label should not be nullable, or else we should have an entity id: element.label
				return element.itemData.clientInstance.getSubscriptions(element.label || '')
					.then(mapToSubscription);
			}
		}
		else if (element instanceof QueueList) {
			if (element.itemData.clientInstance) {
				return element.itemData.clientInstance.getQueues()
					.then(x => x.map(y =>
						new Queue(element.itemData, y.title)
					));
			}
		}

		return Promise.resolve([]);
	}

	public reBuildTree(): void {
		var items = this.state.get<IItemData[]>(NAMESPACE_CONNECTIONS, []);
		var tasks = items.map(async element => {

			try {
				element.error = null;
				element.clientInstance = new ServiceBusClient(element.connection);
				await element.clientInstance.validateAndThrow();
			}
			catch (ex) {
				element.error = ex;
			}

		});

		Promise.all(tasks).then(x => {
			this.state.update(NAMESPACE_CONNECTIONS, items);
			this._onDidChangeTreeData.fire();
		});

		this.state.update(NAMESPACE_CONNECTIONS, items);
		this._onDidChangeTreeData.fire();
	}

	public addNamespace(item: IItemData) {
		var items = this.state.get<IItemData[]>(NAMESPACE_CONNECTIONS, []);
		items.push(item);

		this.state.update(NAMESPACE_CONNECTIONS, items);
		this._onDidChangeTreeData.fire();
	}

	public editNamespace(node: NameSpaceItem, item: IItemData) {
		var items = this.state.get<IItemData[]>(NAMESPACE_CONNECTIONS, []);

		items.forEach((p) => {
			if (p.name === node.data.name) {
				p.name = item.name;
				p.connection = item.connection;
			}
		});

		this.state.update(NAMESPACE_CONNECTIONS, items);
		this._onDidChangeTreeData.fire();
	}

	public deleteNamespace(node: NameSpaceItem) {
		var items = this.state.get<IItemData[]>(NAMESPACE_CONNECTIONS, []);
		items = items.filter(p => p.name !== node.data.name);

		this.state.update(NAMESPACE_CONNECTIONS, items);
		this._onDidChangeTreeData.fire();
	}
}