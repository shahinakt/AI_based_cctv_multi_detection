"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const evaluate_style_1 = require("./lib/evaluate-style");
const matches_media_query_1 = require("./lib/matches-media-query");
const add_font_variant_1 = require("./lib/add-font-variant");
const add_letter_spacing_1 = require("./lib/add-letter-spacing");
const create = (utilities, environment) => {
    // Pass a list of class names separated by a space, for example:
    // "bg-green-100 text-green-800 font-semibold")
    // and receive a styles object for use in React Native views
    const tailwind = (classNames) => {
        const style = {};
        if (!classNames) {
            return style;
        }
        // Font variant utilities need a special treatment, because there can be
        // many font variant classes and they need to be transformed to an array
        (0, add_font_variant_1.default)(style, classNames);
        // Letter spacing also needs a special treatment, because its value is set
        // in em unit, that's why it requires a font size to be set too, so that
        // we can calculate a px value
        (0, add_letter_spacing_1.default)(utilities, style, classNames);
        const separateClassNames = classNames
            .replace(/\s+/g, ' ')
            .trim()
            .split(' ');
        for (const className of separateClassNames) {
            // Skip font variant and letter spacing utiltiies, because they're
            // handled by `addFontVariant` and `addLetterSpacing` functions
            if (className.endsWith('-nums') || className.startsWith('tracking-')) {
                continue;
            }
            const utility = utilities[className];
            if (!utility) {
                console.warn(`Unsupported Tailwind class: "${className}"`);
                continue;
            }
            if (utility.media) {
                if ((0, matches_media_query_1.default)(utility.media, environment)) {
                    Object.assign(style, utility.style);
                }
            }
            else {
                Object.assign(style, utility.style);
            }
        }
        return (0, evaluate_style_1.default)(style);
    };
    return tailwind;
};
exports.default = create;
