/**
 * View geometry shared by every renderer: projection, panel layout, and the
 * drawing primitives a backend has to put on the page.
 *
 * `svg.ts` and `png.ts` both consume this. Keeping it separate is what makes
 * the two outputs agree by construction rather than by two copies of the same
 * arithmetic: a panel is laid out once, and each backend only decides how to
 * put a polyline, a label and a background on its own canvas.
 *
 * @module
 */
import type { BoundingBox, BoundingBoxOptions, ProjectionData, ShapeHandle, Vec3 } from "./types.js";
/** The subset of the kernel API the renderers depend on. */
export interface ViewKernel {
    getBoundingBox(shape: ShapeHandle, options?: BoundingBoxOptions): BoundingBox;
    projectEdges(shape: ShapeHandle, viewOrigin: Vec3, viewDirection: Vec3, xAxis?: Vec3): ProjectionData;
    wireframe(shape: ShapeHandle, deflection?: number): {
        points: Float32Array;
        edgeGroups: Int32Array;
    };
    release(shape: ShapeHandle): void;
}
/** A named orthographic or isometric viewpoint. */
export type ViewName = "front" | "back" | "top" | "bottom" | "left" | "right" | "iso";
/** Options shared by single-view and multiview rendering. */
export interface ViewOptions {
    /** Panel width in px (default 240). */
    width?: number;
    /** Panel height in px (default 240). */
    height?: number;
    /** Inner padding in px (default 14). */
    padding?: number;
    /**
     * Wireframe sampling deflection in model units. Defaults to ~0.2% of the
     * bounding-box diagonal so output is scale-independent.
     */
    deflection?: number;
    /** Draw hidden (occluded) edges dashed (default true). */
    showHidden?: boolean;
    /** Draw a small XYZ axis gnomon in each panel (default true). The labels
     *  sit past each arm's tip; without it a line drawing is pure grey, and
     *  the PNG is written as greyscale. */
    showGnomon?: boolean;
    /** Stroke width for visible edges in px (default 1). */
    strokeWidth?: number;
    /** Panel background fill (default "#ffffff"). */
    background?: string;
    /** Visible-edge stroke color (default "#111111"). */
    visibleColor?: string;
    /** Hidden-edge stroke color (default "#9e9e9e"; a pure grey, so a drawing without the gnomon is written as a greyscale PNG). */
    hiddenColor?: string;
}
/** Options for the multiview grid. */
export interface MultiviewOptions extends ViewOptions {
    /** Views to render, in order (default front, top, right, iso). */
    views?: ViewName[];
    /** Panels per row (default 2). */
    columns?: number;
    /** Draw the per-view name label (default true). */
    showLabels?: boolean;
    /** Annotate overall X×Y×Z size in a footer (default true). */
    showDimensions?: boolean;
}
export interface ViewBasis {
    /** Projection direction (camera looks along this). */
    dir: Vec3;
    /** Screen-horizontal axis (points right). */
    sx: Vec3;
    /** Screen-vertical axis (points up). */
    sy: Vec3;
}
export declare function basisFor(view: ViewName): ViewBasis;
export declare const VIEW_LABEL: Record<ViewName, string>;
/** A 2D polyline in view (u right, v up) coordinates. */
export type Polyline = number[];
export interface ViewEdges {
    visible: Polyline[];
    hidden: Polyline[];
}
export declare function collectEdges(kernel: ViewKernel, shape: ShapeHandle, viewBasis: ViewBasis, deflection: number): ViewEdges;
/** 2D extent of a set of polylines in view coords. */
export interface Extent {
    minU: number;
    maxU: number;
    minV: number;
    maxV: number;
}
export declare function extentOf(views: ViewEdges[]): Extent;
export interface PanelTransform {
    scale: number;
    offsetX: number;
    offsetY: number;
    inner: number;
    panelW: number;
    panelH: number;
    pad: number;
}
/**
 * Build a view→pixel mapping for one panel. All panels share `scale` (so the
 * part is the same size everywhere) but center on their own projected midpoint.
 */
export declare function panelTransform(ext: Extent, scale: number, panelW: number, panelH: number, pad: number): PanelTransform;
/** Map a polyline from view coords into panel pixels: [x0, y0, x1, y1, ...]. */
export declare function toPixels(line: Polyline, t: PanelTransform): number[];
export declare function resolved(options: ViewOptions): {
    width: number;
    height: number;
    padding: number;
    showHidden: boolean;
    showGnomon: boolean;
    strokeWidth: number;
    background: string;
    visibleColor: string;
    hiddenColor: string;
};
export declare function deflectionFor(kernel: ViewKernel, shape: ShapeHandle, options: ViewOptions): number;
/** One arm of the XYZ gnomon, already in panel pixels. */
export interface GnomonArm {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    color: string;
    label: string;
    /** Where the label goes: past the tip along the arm, clear of the line. */
    lx: number;
    ly: number;
}
/** The gnomon arms for a view, or an empty list when every axis points into
 *  the screen. Axes within 0.05 of the view direction are dropped. */
export declare function gnomonArms(viewBasis: ViewBasis, t: PanelTransform): GnomonArm[];
/** Panel origins and the shared scale for a grid of views. */
export interface GridLayout {
    columns: number;
    rows: number;
    totalW: number;
    totalH: number;
    footerH: number;
    scale: number;
    /** Per-view: panel origin in the grid and its own centering transform. */
    panels: Array<{
        px: number;
        py: number;
        t: PanelTransform;
    }>;
}
export declare function gridLayout(extents: Extent[], o: ReturnType<typeof resolved>, columns: number, showDimensions: boolean): GridLayout;
/** The single-panel equivalent of gridLayout. */
export declare function singleLayout(ext: Extent, o: ReturnType<typeof resolved>): PanelTransform;
/** The "100 × 60 × 40 (X×Y×Z)" footer text. */
export declare function dimensionsText(kernel: ViewKernel, shape: ShapeHandle, round: (n: number) => number): string;
//# sourceMappingURL=views.d.ts.map