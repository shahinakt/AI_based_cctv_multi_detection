"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const css = require("css");
const css_to_react_native_1 = require("css-to-react-native");
const rem_to_px_1 = require("./lib/rem-to-px");
const getStyle = (rule) => {
    const declarations = rule.declarations;
    const properties = declarations
        .filter(({ property }) => property !== 'transform')
        .map(({ property, value }) => {
        if (typeof value === 'string' && value.endsWith('rem')) {
            return [property, (0, rem_to_px_1.default)(value)];
        }
        return [property, value];
    });
    return (0, css_to_react_native_1.default)(properties);
};
const build = (source) => {
    const { stylesheet } = css.parse(source);
    // Mapping of Tailwind class names to React Native styles
    const utilities = {};
    if (!stylesheet) {
        return utilities;
    }
    const addRule = (rule, media) => {
        if (!Array.isArray(rule.selectors)) {
            return;
        }
        for (const selector of rule.selectors) {
            const utility = selector.replace(/^\./, '').replace(/\\/g, '');
            utilities[utility] = {
                style: getStyle(rule),
                media
            };
        }
    };
    for (const rule of stylesheet.rules) {
        if (rule.type === 'rule') {
            addRule(rule);
        }
        if (rule.type === 'media') {
            const mediaRule = rule;
            for (const childRule of mediaRule.rules) {
                if (childRule.type === 'rule') {
                    addRule(childRule, mediaRule.media);
                }
            }
        }
    }
    return utilities;
};
exports.default = build;
