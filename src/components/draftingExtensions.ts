import { Extension, Mark, Node, mergeAttributes } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import FontFamily from "@tiptap/extension-font-family";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import Typography from "@tiptap/extension-typography";
import Placeholder from "@tiptap/extension-placeholder";
import CharacterCount from "@tiptap/extension-character-count";
import Focus from "@tiptap/extension-focus";
import { TextStyle } from "@tiptap/extension-text-style";
import type { DefinedTerm } from "./draftingApi";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    title: {
      setTitle: () => ReturnType;
    };
    fontSize: {
      setFontSize: (fontSize: string) => ReturnType;
      unsetFontSize: () => ReturnType;
    };
  }

  interface Storage {
    blankField?: {
      count: number;
    };
  }
}

const BLANK_FIELD_REGEX =
  /(?:_{3,}|\.{4,}|\[[A-Z][A-Z\s/-]{1,}\]|\([ _]{3,}\))/g;

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "heading";

const isWordChar = (value: string) => /[A-Za-z0-9_]/.test(value);

const isInsideRanges = (position: number, ranges: Array<{ from: number; to: number }>) =>
  ranges.some((range) => position >= range.from && position <= range.to);

const getDefinitionsRanges = (doc: { descendants: Function }) => {
  const headings: Array<{ level: number; from: number; text: string }> = [];
  doc.descendants((node: { type: { name: string }; attrs: { level?: number }; textContent: string }, pos: number) => {
    if (node.type.name !== "heading") return;
    headings.push({
      level: Number(node.attrs.level || 1),
      from: pos,
      text: String(node.textContent || "").trim().toLowerCase(),
    });
  });

  return headings
    .filter((item) => item.text === "definitions")
    .map((item) => {
      const next = headings.find(
        (candidate) => candidate.from > item.from && candidate.level <= item.level,
      );
      return {
        from: item.from,
        to: next ? next.from - 1 : Number.MAX_SAFE_INTEGER,
      };
    });
};

const findDefinedTermMatches = (text: string, term: string) => {
  const normalizedTerm = term.trim();
  if (!normalizedTerm) return [];

  const regex = new RegExp(escapeRegExp(normalizedTerm).replace(/\s+/g, "\\s+"), "gi");
  const matches: Array<{ from: number; to: number }> = [];
  let match = regex.exec(text);

  while (match) {
    const start = match.index;
    const end = start + match[0].length;
    const left = start > 0 ? text[start - 1] : "";
    const right = end < text.length ? text[end] : "";
    if (!isWordChar(left) && !isWordChar(right)) {
      matches.push({ from: start, to: end });
    }
    match = regex.exec(text);
  }

  return matches;
};

const BlankFieldMark = Mark.create<{
  onCountChange?: (count: number) => void;
}>({
  name: "blankField",

  addOptions() {
    return {
      onCountChange: undefined,
    };
  },

  addStorage() {
    return {
      count: 0,
    };
  },

  addAttributes() {
    return {
      placeholder: {
        default: "",
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-blank-field]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-blank-field": "true",
        class: "draftBlankField",
        title: "This field requires a value",
      }),
      0,
    ];
  },

  addProseMirrorPlugins() {
    const extension = this;
    const markType = this.type;
    let lastCount = 0;

    return [
      new Plugin({
        key: new PluginKey("draftBlankFieldPlugin"),
        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some((transaction) => transaction.docChanged)) {
            return null;
          }

          const tr = newState.tr;
          let mutated = false;
          let count = 0;

          newState.doc.descendants((node, pos) => {
            if (!node.isText || !node.text) return;

            if (node.marks.some((mark) => mark.type === markType)) {
              tr.removeMark(pos, pos + node.text.length, markType);
              mutated = true;
            }

            const matches = [...node.text.matchAll(BLANK_FIELD_REGEX)];
            count += matches.length;

            matches.forEach((match) => {
              const value = match[0] || "";
              const from = pos + (match.index || 0);
              const to = from + value.length;
              tr.addMark(from, to, markType.create({ placeholder: value }));
              mutated = true;
            });
          });

          extension.storage.count = count;
          if (count !== lastCount) {
            lastCount = count;
            extension.options.onCountChange?.(count);
          }

          return mutated ? tr : null;
        },
        view() {
          return {
            update(view) {
              let count = 0;
              view.state.doc.descendants((node) => {
                if (!node.isText || !node.text) return;
                count += [...node.text.matchAll(BLANK_FIELD_REGEX)].length;
              });
              extension.storage.count = count;
              if (count !== lastCount) {
                lastCount = count;
                extension.options.onCountChange?.(count);
              }
            },
          };
        },
      }),
    ];
  },
});

const DefinedTermMark = Mark.create<{
  definedTerms: DefinedTerm[];
}>({
  name: "definedTerm",

  addOptions() {
    return {
      definedTerms: [],
    };
  },

  addAttributes() {
    return {
      term: {
        default: "",
      },
      definition: {
        default: "",
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-defined-term]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-defined-term": "true",
        class: "draftDefinedTerm",
        title: HTMLAttributes.definition || "",
      }),
      0,
    ];
  },

  addProseMirrorPlugins() {
    const markType = this.type;
    const getTerms = () =>
      (this.options.definedTerms || [])
        .filter((item) => item?.term && item?.definitionText)
        .sort((left, right) => right.term.length - left.term.length);

    return [
      new Plugin({
        key: new PluginKey("draftDefinedTermsPlugin"),
        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some((transaction) => transaction.docChanged)) {
            return null;
          }

          const terms = getTerms();
          if (!terms.length) {
            return null;
          }

          const ranges = getDefinitionsRanges(newState.doc);
          const tr = newState.tr;
          let mutated = false;

          newState.doc.descendants((node, pos) => {
            if (!node.isText || !node.text) return;

            if (node.marks.some((mark) => mark.type === markType)) {
              tr.removeMark(pos, pos + node.text.length, markType);
              mutated = true;
            }

            if (isInsideRanges(pos, ranges)) {
              return;
            }

            terms.forEach((term) => {
              findDefinedTermMatches(node.text || "", term.term).forEach((match) => {
                tr.addMark(
                  pos + match.from,
                  pos + match.to,
                  markType.create({
                    term: term.term,
                    definition: term.definitionText,
                  }),
                );
                mutated = true;
              });
            });
          });

          return mutated ? tr : null;
        },
      }),
    ];
  },
});

const TitleNode = Node.create({
  name: "title",
  group: "block",
  content: "inline*",
  defining: true,

  parseHTML() {
    return [{ tag: 'p[data-node-type="title"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "p",
      mergeAttributes(HTMLAttributes, {
        "data-node-type": "title",
        class: "draftTitleNode",
      }),
      0,
    ];
  },

  addCommands() {
    return {
      setTitle:
        () =>
        ({ commands }) =>
          commands.setNode(this.name),
    };
  },
});

const FontSizeExtension = Extension.create({
  name: "fontSize",

  addGlobalAttributes() {
    return [
      {
        types: ["textStyle"],
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (element) => element.style.fontSize || null,
            renderHTML: (attributes) =>
              attributes.fontSize
                ? {
                    style: `font-size: ${attributes.fontSize}`,
                  }
                : {},
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setFontSize:
        (fontSize: string) =>
        ({ chain }) =>
          chain().setMark("textStyle", { fontSize }).run(),
      unsetFontSize:
        () =>
        ({ chain }) =>
          chain().setMark("textStyle", { fontSize: null }).removeEmptyTextStyle().run(),
    };
  },
});

const HeadingIdExtension = Extension.create({
  name: "headingId",

  addGlobalAttributes() {
    return [
      {
        types: ["heading"],
        attributes: {
          id: {
            default: null,
            renderHTML: (attributes) =>
              attributes.id
                ? {
                    id: attributes.id,
                    "data-heading-id": attributes.id,
                  }
                : {},
          },
        },
      },
    ];
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("draftHeadingIds"),
        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some((transaction) => transaction.docChanged)) {
            return null;
          }

          const tr = newState.tr;
          const seen = new Map<string, number>();
          let mutated = false;

          newState.doc.descendants((node, pos) => {
            if (node.type.name !== "heading") return;
            const base = slugify(node.textContent || "heading");
            const count = seen.get(base) || 0;
            seen.set(base, count + 1);
            const nextId = count > 0 ? `${base}-${count + 1}` : base;
            if (node.attrs.id !== nextId) {
              tr.setNodeMarkup(pos, undefined, {
                ...node.attrs,
                id: nextId,
              });
              mutated = true;
            }
          });

          return mutated ? tr : null;
        },
      }),
    ];
  },
});

const ShortcutExtension = Extension.create<{
  onSave?: () => void;
  onOpenFind?: () => void;
}>({
  name: "draftingShortcuts",

  addOptions() {
    return {
      onSave: undefined,
      onOpenFind: undefined,
    };
  },

  addKeyboardShortcuts() {
    return {
      "Mod-s": () => {
        this.options.onSave?.();
        return true;
      },
      "Mod-h": () => {
        this.options.onOpenFind?.();
        return true;
      },
      "Mod-[": () => this.editor.commands.liftListItem("listItem"),
      "Mod-]": () => this.editor.commands.sinkListItem("listItem"),
      "Mod-Shift-l": () => this.editor.commands.toggleBulletList(),
      "Mod-Shift-7": () => this.editor.commands.toggleOrderedList(),
      "Mod-u": () => this.editor.commands.toggleUnderline(),
    };
  },
});

export const createEmptyDraftDocument = (): JSONContent => ({
  type: "doc",
  content: [
    {
      type: "paragraph",
    },
  ],
});

export const buildDraftingExtensions = (options: {
  definedTerms?: DefinedTerm[];
  onBlankFieldCountChange?: (count: number) => void;
  onSaveShortcut?: () => void;
  onOpenFindShortcut?: () => void;
}) => [
  StarterKit,
  TextStyle,
  Underline,
  TextAlign.configure({
    types: ["heading", "paragraph", "title"],
  }),
  FontFamily.configure({
    types: ["textStyle"],
  }),
  Color.configure({
    types: ["textStyle"],
  }),
  Highlight.configure({
    multicolor: true,
  }),
  Link.configure({
    openOnClick: false,
    autolink: true,
    defaultProtocol: "https",
  }),
  Image.configure({
    inline: true,
    allowBase64: true,
  }),
  Table.configure({
    resizable: false,
  }),
  TableRow,
  TableHeader,
  TableCell,
  Typography,
  Placeholder.configure({
    placeholder: "Start drafting...",
  }),
  CharacterCount,
  Focus.configure({
    className: "has-focus",
    mode: "all",
  }),
  FontSizeExtension,
  HeadingIdExtension,
  TitleNode,
  BlankFieldMark.configure({
    onCountChange: options.onBlankFieldCountChange,
  }),
  DefinedTermMark.configure({
    definedTerms: options.definedTerms || [],
  }),
  ShortcutExtension.configure({
    onSave: options.onSaveShortcut,
    onOpenFind: options.onOpenFindShortcut,
  }),
];
