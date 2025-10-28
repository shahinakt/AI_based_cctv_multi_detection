"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const regex = /(oldstyle-nums|lining-nums|tabular-nums|proportional-nums)/;
const utilities = [
    'oldstyle-nums',
    'lining-nums',
    'tabular-nums',
    'proportional-nums'
];
const addFontVariant = (style, classNames) => {
    if (!regex.test(classNames)) {
        return;
    }
    const fontVariant = [];
    for (const utility of utilities) {
        if (classNames.includes(utility)) {
            fontVariant.push(utility);
        }
    }
    style['fontVariant'] = fontVariant;
};
exports.default = addFontVariant;
