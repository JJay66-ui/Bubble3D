/**
 * Multiview SVG rendering for OCCT shapes.
 *
 * Renders a shape to compact, deterministic SVG by running OCCT hidden-line
 * removal (`projectEdges`) per view, discretizing the projected edges
 * (`wireframe`), and mapping the flattened 3D points into 2D screen space.
 *
 * The default output is a 4-up Front / Top / Right / Isometric grid with
 * visible edges drawn solid and hidden edges dashed, a per-view XYZ gnomon,
 * and an overall bounding-box annotation — a layout aimed at letting an
 * automated agent reason about geometry it cannot otherwise see.
 *
 * The projection and layout live in `views.ts`, shared with the PNG renderer
 * so the two outputs cannot drift apart.
 *
 * @module
 */
import type { ShapeHandle } from "./types.js";
import type { MultiviewOptions, ViewKernel, ViewName, ViewOptions } from "./views.js";
/** The subset of the kernel API the SVG renderer depends on. */
export type SvgKernel = ViewKernel;
export type { ViewName };
/** Options shared by single-view and multiview rendering. */
export type SvgViewOptions = ViewOptions;
/** Options for the multiview grid. */
export type MultiviewSvgOptions = MultiviewOptions;
/**
 * Render a single named view of `shape` to a standalone SVG string.
 */
export declare function renderShapeSVG(kernel: SvgKernel, shape: ShapeHandle, view?: ViewName, options?: SvgViewOptions): string;
/**
 * Render a multiview grid (default Front / Top / Right / Iso) of `shape` to a
 * single SVG string. All orthographic panels share one scale; an optional
 * footer annotates the overall X×Y×Z size.
 */
export declare function renderMultiviewSVG(kernel: SvgKernel, shape: ShapeHandle, options?: MultiviewSvgOptions): string;
//# sourceMappingURL=svg.d.ts.map