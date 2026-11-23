/**
 * Multiview PNG rendering for OCCT shapes.
 *
 * The same drawing as `svg.ts` -- hidden-line removal per view, one shared
 * scale, a per-view gnomon and labels -- rasterised here instead of written as
 * vector markup. Both take their geometry and layout from `views.ts`, so a PNG
 * and an SVG of the same shape show the same picture.
 *
 * Everything is done here: an antialiased line rasteriser, a small bitmap font
 * for the labels, and a PNG encoder over the platform's CompressionStream.
 * That keeps the renderer free of native modules and of a font file,
 * which matters because callers embed this in single-file binaries. The cost
 * is that text is a fixed 5x7 bitmap face rather than the caller's font.
 *
 * @module
 */
import type { ShapeHandle } from "./types.js";
import type { MultiviewOptions, ViewKernel, ViewName, ViewOptions } from "./views.js";
/** The subset of the kernel API the PNG renderer depends on. */
export type PngKernel = ViewKernel;
export interface PngViewOptions extends ViewOptions {
    /**
     * Supersampling factor (default 2). The scene is rasterised this many
     * times larger and box-filtered down, which is what keeps a 1 px line
     * legible. 1 disables it; above 3 the file grows for no visible gain.
     * The output size is `width` x `height` either way.
     */
    supersample?: number;
}
export interface MultiviewPngOptions extends MultiviewOptions, PngViewOptions {
}
/**
 * Render a single named view of `shape` to PNG bytes.
 */
export declare function renderShapePNG(kernel: PngKernel, shape: ShapeHandle, view?: ViewName, options?: PngViewOptions): Promise<Uint8Array>;
/**
 * Render a multiview grid (default Front / Top / Right / Iso) of `shape` to
 * PNG bytes. Same layout as {@link renderMultiviewSVG}.
 */
export declare function renderMultiviewPNG(kernel: PngKernel, shape: ShapeHandle, options?: MultiviewPngOptions): Promise<Uint8Array>;
//# sourceMappingURL=png.d.ts.map