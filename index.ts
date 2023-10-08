const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d')!;

const obs = new ResizeObserver(entries => {
    const rect = entries[0].contentRect;
    canvas.width = rect.width;
    canvas.height = rect.height;
});

obs.observe(canvas)

window.addEventListener('load', () => document.body.appendChild(canvas));

type Point = {
    x: number,
    y: number,
};

type Rect = {
    w: number,
    h: number,
};

type PlotRange = {
    start: number,
    end: number,
};

class PlotView {

    constructor(
        public center: Point,
        public size: Rect,
    ) {
    }

    get top_left(): Point {
        return {
            x: this.center.x - this.size.w / 2,
            y: this.center.y + this.size.h / 2,
        };
    }

    get bottom_right(): Point {
        return {
            x: this.top_left.x + this.size.w,
            y: this.top_left.y - this.size.h,
        };
    }

    project(point: Point): Point {
        const cx = this.center.x;
        const cy = this.center.y;

        const w = this.size.w;
        const h = this.size.h;

        return {
            x: map(point.x, cx - w / 2, cx + w / 2, 0, canvas.width),
            y: map(point.y, cy - h / 2, cy + h / 2, canvas.height, 0),
        };
    }

    unproject(point: Point): Point {
        const br = this.bottom_right;
        const tl = this.top_left;

        return {
            x: map(point.x, 0, canvas.width, tl.x, br.x),
            y: map(point.y, canvas.height, 0, br.y, tl.y),
        };
    }

}

function map(v: number, fmin: number, fmax: number, tmin: number, tmax: number): number {
    return (v - fmin) / (fmax - fmin) * (tmax - tmin) + tmin;
}

class MathFunction {

    constructor(
        public readonly fn: (x: number) => number,
    ) {
    }

    get(x: number): number {
        return this.fn(x);
    }

    sample(start: number, end: number, samples: number): Point[] {
        let out = new Array<Point>(samples);

        for (let i = 0; i < samples; i++) {
            const x = map(i, 0, samples - 1, start, end);

            out[i] = {
                x: x,
                y: this.fn(x),
            };
        }

        return out;
    }

}

function clear() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function grid(view: PlotView, granularity: number = 0.1) {
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 2;

    const origin = view.project({ x: 0, y: 0 });

    ctx.beginPath();
    ctx.moveTo(0, origin.y);
    ctx.lineTo(canvas.width, origin.y);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(origin.x, 0);
    ctx.lineTo(origin.x, canvas.height);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.lineWidth = 0.2;

    for (let x = granularity; x <= view.bottom_right.x; x += granularity) {
        const point = view.project({ x: x, y: 0 });

        if (x % 1 < 0.01) {
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
            ctx.lineWidth = 0.8;
        } else {
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
            ctx.lineWidth = 0.2;
        }

        ctx.beginPath();
        ctx.moveTo(point.x, 0);
        ctx.lineTo(point.x, canvas.height);
        ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.lineWidth = 0.2;

    for (let x = granularity; x >= view.top_left.x; x -= granularity) {
        const point = view.project({ x: x, y: 0 });

        ctx.beginPath();
        ctx.moveTo(point.x, 0);
        ctx.lineTo(point.x, canvas.height);
        ctx.stroke();
    }


    for (let y = granularity; y <= view.top_left.y; y += granularity) {
        const point = view.project({ x: 0, y: y });

        ctx.beginPath();
        ctx.moveTo(0, point.y);
        ctx.lineTo(canvas.width, point.y);
        ctx.stroke();
    }

    for (let y = granularity; y >= view.bottom_right.y; y -= granularity) {
        const point = view.project({ x: 0, y: y });

        ctx.beginPath();
        ctx.moveTo(0, point.y);
        ctx.lineTo(canvas.width, point.y);
        ctx.stroke();
    }
}

function plot(points: Point[], view: PlotView, color: string) {
    ctx.beginPath();

    points.forEach((raw, i) => {
        const point = view.project(raw);

        if (i === 0) {
            ctx.moveTo(point.x, point.y);
        } else {
            ctx.lineTo(point.x, point.y);
        }
    });

    ctx.lineWidth = 2;
    ctx.strokeStyle = color;
    ctx.stroke();
}

function integrate(f: (x: number) => number, start: number, end: number, samples: number): number {
    const width = map(1, 0, samples - 1, start, end);

    let area = 0;

    for (let i = 0; i < samples; i++) {
        const x = map(i, 0, samples - 1, start, end);
        const y = f(x);
        area += width * y;
    }

    return area;
}

let Freq = 1.5;
let Phase = 0;
const f = new MathFunction(x => Math.sin(Freq * x - Phase));

const C = new MathFunction(w => {
    return integrate(x => f.get(x) * Math.sin(w * x), 0, Math.PI * 20, 1000);
});

const D = new MathFunction(w => {
    return integrate(x => f.get(x) * Math.cos(w * x), 0, Math.PI * 20, 1000);
});

const A = new MathFunction(w => {
    const c = C.get(w);
    const d = D.get(w);

    return Math.sqrt(c * c + d * d);
});

const Theta = new MathFunction(w => {
    const c = C.get(w);
    const d = D.get(w);

    return Math.atan(d / c);
});

const view = new PlotView({
    x: 2,
    y: 0,
}, {
    w: 4,
    h: 8,
});

const T = 6;
const cache: { [key: string]: Point[] } = {
    A: A.sample(0, T, 5000),
};

function render() {
    grid(view, 0.5);

    const t = Date.now() / 1000 / 4;
    Freq = Math.sin(t) + 1.5;
    Phase = (t % 1) * Math.PI * 2;

    plot(C.sample(0, 4, 1000), view, 'cornflowerblue');
    plot(D.sample(0, 4, 1000), view, 'rebeccapurple');
}

type DragData = {
    pointer_id: number,
    start: Point,
    view: PlotView,
};

let dragging: DragData | undefined = undefined;

canvas.addEventListener('pointerdown', e => {
    if (dragging) {
        return;
    }

    canvas.style.cursor = 'grabbing';

    dragging = {
        pointer_id: e.pointerId,
        start: view.unproject({ x: e.x, y: e.y }),
        view: new PlotView({
            x: view.center.x,
            y: view.center.y,
        }, {
            w: view.size.w,
            h: view.size.h,
        }),
    };
});

canvas.addEventListener('pointermove', e => {
    if (!dragging || dragging.pointer_id != e.pointerId) {
        return;
    }

    const point = dragging.view.unproject({
        x: e.x,
        y: e.y,
    });

    const diff = {
        x: point.x - dragging.start.x,
        y: dragging.start.y - point.y,
    };

    view.center = {
        x: dragging.view.center.x - diff.x,
        y: dragging.view.center.y + diff.y,
    };
});

canvas.addEventListener('pointerup', e => {
    if (!dragging || dragging.pointer_id != e.pointerId) {
        return;
    }

    canvas.style.cursor = '';
    dragging = undefined;
});

function frame(t: number) {
    clear();
    render();
    requestAnimationFrame(frame);
}

window.addEventListener('wheel', e => {
    const dy = e.deltaY;

    const w = view.size.w;
    const h = view.size.h;

    view.size.w += w * 0.1 * dy / 125;
    view.size.h += h * 0.1 * dy / 125;
});

requestAnimationFrame(frame);
