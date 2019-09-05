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
			return Promise.resolve([
				new QueueList(element.data, vscode.TreeItemCollapsibleState.Collapsed),
				new TopicList(element.data, vscode.TreeItemCollapsibleState.Collapsed),
			]);
		}
		else if (element instanceof TopicList) {
			if (element.itemData.clientInstance) {
				return element.itemData.clientInstance.getTopics()
					.then(x => x.map(y =>
						new Topic(element.itemData, y.title, vscode.TreeItemCollapsibleState.Collapsed)
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