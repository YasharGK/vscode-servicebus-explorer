import { QuickPickItem, window, Disposable, CancellationToken, QuickInputButton, QuickInput, ExtensionContext, QuickInputButtons, Uri } from 'vscode';
import {  MultiStepInput }  from './multiStepInput';

interface State {
    title: string;
    step: number;
    totalSteps: number;
    //connectionString: QuickPickItem | string;
    connectionString: string;
    name: string;
    runtime: QuickPickItem;
}


export async function addNamespace(context: ExtensionContext): Promise<State> {
    const title = 'Add Namespace';

    async function pickConnnectionString(input: MultiStepInput, state: Partial<State>) {
		state.connectionString = await input.showInputBox({
			title,
			step: 1,
			totalSteps: 2,
			value: typeof state.connectionString === 'string' ? state.connectionString : '',
			prompt: 'Paste the connection string to the namespace',
			validate: validateConnectionString,
			shouldResume: shouldResume
        });
        
        return (input: MultiStepInput) => inputName(input, state);
	}

    async function inputName(input: MultiStepInput, state: Partial<State>) {
		// TODO: Remember current value when navigating back.
		state.name = await input.showInputBox({
			title,
			step: 2 ,
			totalSteps: 2,
			value: state.name || '',
			prompt: 'Choose a name for the namespace',
			validate: validateNameIsUnique,
			shouldResume: shouldResume
		});
    }
    

    async function collectInputs() {
		const state = {} as Partial<State>;
		await MultiStepInput.run(input => pickConnnectionString(input, state));
		return state as State;
    }
    
    const state = await collectInputs();

    
    window.showInformationMessage(`Adding Namespace  '${state.name}'`);
    
    return  state;
    
    async function validateConnectionString(name: string) {
		// ...validate...
		await new Promise(resolve => setTimeout(resolve, 1000));
		return name === 'vscode' ? 'Name not unique' : undefined;
    }

    async function validateNameIsUnique(name: string) {
		// ...validate...
		await new Promise(resolve => setTimeout(resolve, 1000));
		return name === 'vscode' ? 'Name not unique' : undefined;
    }
    
    function shouldResume() {
		// Could show a notification with the option to resume.
		return new Promise<boolean>((resolve, reject) => {

		});
	}
}