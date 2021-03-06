import { observer } from "mobx-react";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { bind } from "bind-decorator";

import { CodeEditor } from "shared/ui/code-editor";

import { EditorComponent } from "project-editor/core/metaData";
import { UndoManager, updateObject } from "project-editor/core/store";
import { BuildFileProperties } from "project-editor/project/project";

@observer
export class BuildFileEditor extends EditorComponent {
    codeEditor: CodeEditor;

    @bind
    onChange(value: string) {
        updateObject(this.props.editor.object, {
            template: value
        });
    }

    @bind
    onFocus() {
        UndoManager.setCombineCommands(true);
    }

    @bind
    onBlur() {
        UndoManager.setCombineCommands(false);
    }

    componentDidMount() {
        $(ReactDOM.findDOMNode(this.codeEditor) as Element).on("autoLayout:resize", () => {
            this.codeEditor.resize();
        });
    }

    componentWillUnmount() {
        $(ReactDOM.findDOMNode(this.codeEditor) as Element).off("autoLayout:resize");
    }

    render() {
        let buildFile = this.props.editor.object as BuildFileProperties;
        return (
            <CodeEditor
                ref={ref => (this.codeEditor = ref!)}
                mode="c_cpp"
                value={buildFile.template}
                onChange={this.onChange}
                onFocus={this.onFocus}
                onBlur={this.onBlur}
                className="layoutCenter"
            />
        );
    }
}
