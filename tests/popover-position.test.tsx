import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { useRef } from "react";
import { placePopover, usePopoverPosition } from "../src/components/popover-position";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const viewport = { left: 0, top: 0, width: 1280, height: 720 };
const size = { width: 320, height: 400 };

it("slides a tall thread along the bottom edge without flipping on small scrolls", () => {
  const positions = [500, 499, 498, 499.5, 501, 500].map(top => placePopover({ left: 500, top }, size, viewport));
  expect(positions.every(p => p.top === 308 && p.left === 520)).toBe(true);
  expect(placePopover({ left: 500, top: 319 }, size, viewport).top).toBe(307);
});

it("keeps right-edge comments inside the viewport and handles narrow or shifted viewports", () => {
  expect(placePopover({ left: 1260, top: 10 }, size, viewport)).toEqual({ left: 920, top: 12 });
  expect(placePopover({ left: 300, top: 800 }, { width: 296, height: 400 }, { left: 0, top: 400, width: 320, height: 424 })).toEqual({ left: 12, top: 412 });
});

it("repositions when content grows without reading its already-positioned bounds", async () => {
  let resize: ResizeObserverCallback | undefined;
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: ResizeObserverCallback) { resize = callback; }
    observe() {} disconnect() {}
  });
  let height = 180;
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(320);
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(() => height);
  const measure = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    if (this.dataset.testid === "popup") throw new Error("Placement must not depend on the moved popup rect");
    return { left: 0, top: 0, width: 1280, height: 720 } as DOMRect;
  });
  function Harness({ y }: { y: number }) {
    const overlay = useRef<HTMLDivElement>(null);
    const popup = useRef<HTMLDivElement>(null);
    const position = usePopoverPosition({ left: 400, top: y }, overlay, popup, true);
    return <div ref={overlay}><div ref={popup} data-testid="popup" style={position ?? {}} /></div>;
  }
  const view = render(<Harness y={500} />);
  const popup = view.getByTestId("popup");
  expect(popup.style.top).toBe("488px");
  height = 500;
  act(() => { resize?.([], {} as ResizeObserver); });
  await waitFor(() => expect(popup.style.top).toBe(`${window.innerHeight - 512}px`));
  view.rerender(<Harness y={499} />);
  expect(popup.style.top).toBe(`${window.innerHeight - 512}px`);
  expect(measure).toHaveBeenCalled();
});

it("fits the popup to the visible mobile viewport as the keyboard opens and pans", () => {
  const visualViewport = Object.assign(new EventTarget(), { offsetLeft: 0, offsetTop: 0, width: 375, height: 667 });
  vi.stubGlobal("visualViewport", visualViewport);
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(288);
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(180);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0 } as DOMRect);
  function Harness() {
    const overlay = useRef<HTMLDivElement>(null);
    const popup = useRef<HTMLDivElement>(null);
    const placement = usePopoverPosition({ left: 110, top: 600 }, overlay, popup, true);
    return <div ref={overlay}><div ref={popup} data-testid="popup" style={placement ?? {}} /></div>;
  }
  const view = render(<Harness />);
  const popup = view.getByTestId("popup");
  expect(popup.style.left).toBe("12px");
  expect(popup.style.top).toBe("475px");
  act(() => {
    Object.assign(visualViewport, { offsetLeft: 20, offsetTop: 300, width: 260, height: 160 });
    visualViewport.dispatchEvent(new Event("resize"));
  });
  expect(popup.style.left).toBe("32px");
  expect(popup.style.top).toBe("312px");
  expect(popup.style.maxWidth).toBe("236px");
  expect(popup.style.maxHeight).toBe("136px");
  act(() => {
    visualViewport.offsetTop = 350;
    visualViewport.dispatchEvent(new Event("scroll"));
  });
  expect(popup.style.top).toBe("362px");
});
