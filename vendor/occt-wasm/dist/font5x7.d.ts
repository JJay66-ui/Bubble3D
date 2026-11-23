/**
 * A 5x7 bitmap face, enough for the labels the renderers draw: view names,
 * the XYZ gnomon and the "100 x 60 x 40 (XxYxZ)" footer.
 *
 * Shipping a face as data keeps the PNG renderer free of a font file and of
 * any system font lookup, so a caller who embeds this in a single-file binary
 * gets the same picture everywhere. Characters with no glyph render as a gap.
 *
 * Each row is five bits, most significant bit leftmost.
 *
 * @module
 */
export declare const GLYPH_W = 5;
export declare const GLYPH_H = 7;
export declare const FONT_5X7: Record<string, number[]>;
//# sourceMappingURL=font5x7.d.ts.map