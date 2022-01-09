import { mergeAttributes, Node, nodeInputRule } from '@tiptap/core'

export class EditorSmartVariable {
    id: string;
    name: string;
    example: string;

    constructor(options: { id: string, name: string, example?: string }) {
        this.id = options.id;
        this.name = options.name;
        this.example = options.example ?? options.name;
    }
}


export type SmartVariableNodeOptions = {
    HTMLAttributes: Record<string, any>,
    smartVariables: EditorSmartVariable[]
}

declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        smartVariableNode: {
            insertSmartVariable: (smartVariable: EditorSmartVariable) => ReturnType,
        }
    }
}

export const SmartVariableNode = Node.create<SmartVariableNodeOptions>({
    name: 'smartVariable',

    addOptions() {
        return {
            HTMLAttributes: {},
            smartVariables: []
        }
    }, 

    group: 'inline',

    inline: true,
    selectable: true,
    draggable: true,

    atom: true,

    addCommands() {
        return {
            insertSmartVariable: (smartVariable: EditorSmartVariable) => ({ commands }) => {
                return commands.insertContent({ type: this.name, attrs: { id: smartVariable.id } })
            },
        }
    },

    addInputRules() {
        return this.options.smartVariables.map(s => {
            return nodeInputRule({
                find: new RegExp(`\\{\\{${s.id}\\}\\}$`),
                type: this.type,
                getAttributes: () => { return { id: s.id } }
            })
        })
    },

    addAttributes() {
        return {
            id: {
                default: null,
                parseHTML: element => element.getAttribute('data-id'),
                renderHTML: attributes => {
                    if (!attributes.id) {
                        return {}
                    }

                    return {
                        'data-id': attributes.id,
                    }
                },
            },
        }
    },

    parseHTML() {
        return this.options.smartVariables.map(variable => {
            return {
                tag: `span[data-type="${this.name}"][data-id="${variable.id}"]`,
            };
        })
    },

    renderHTML({ node, HTMLAttributes }) {
        return [
            'span',
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
            mergeAttributes({ 'data-type': this.name }, this.options.HTMLAttributes, HTMLAttributes),
            this.options.smartVariables.find(s => s.id === node.attrs.id)?.example ?? "Onbekend",
        ]
    },

    renderText({ node }) {
        return "{{"+node.attrs.id+"}}"
    },
})