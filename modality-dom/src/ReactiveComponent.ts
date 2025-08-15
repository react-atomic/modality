/**
 * ReactiveComponent - Base class for React-like Web Components
 * Adds state management and automatic re-rendering capabilities
 */

export type SetStateAction<TState> =
  | Partial<TState>
  | StateUpdater<TState>
  | TState;

export interface ComponentOptions<T> {
  initialState?: T;
  shouldUpdate?: (newState: T, oldState: T) => boolean;
  stores?: Array<any>;
}

export type StateUpdater<TState> = (prevState: TState) => Partial<TState>;

/**
 * Base class for reactive web components
 */
export abstract class ReactiveComponent<TState = any> extends HTMLElement {
  #state: TState;
  #isRendering = false;
  #pendingUpdate = false;
  #hasRendered = false;
  #shadow!: ShadowRoot;
  #options: ComponentOptions<TState>;
  #delegatedEventListeners: Map<string, EventListener> = new Map();
  #eventTypes = [
    "click",
    "dblclick",
    "mousedown",
    "mouseup",
    "mousemove",
    "mouseover",
    "mouseout",
    "focus",
    "blur",
    "change",
    "input",
    "submit",
    "keydown",
    "keyup",
    "keypress",
  ];
  _stores?: Array<any>;
  _storeListeners?: Array<{ store: any; listener: Function }>;

  constructor(options: ComponentOptions<TState> = {}) {
    super();
    const { stores, initialState } = options;
    this.#options = options;
    let allState: any = { ...initialState };
    if (null != stores && Array.isArray(stores)) {
      this._stores = stores;
      stores.forEach((store) => {
        allState = { ...allState, ...store.getState() };
      });
    }
    this.#state = allState;
  }

  /**
   * Get current state (immutable)
   */
  get state(): Readonly<TState> {
    return this.#state as Readonly<TState>;
  }

  /**
   * Update state and trigger re-render (React-like setState)
   * Also compatible with reshow-flux-base listener: setState(state, action, prevState)
   */
  setState(
    updator: SetStateAction<TState>,
    _action?: any,
    prevState?: TState
  ): TState {
    const oldState = prevState || this.#state;

    let newUpdates;
    if (typeof updator === "function") {
      newUpdates = (updator as StateUpdater<TState>)(this.#state);
    } else {
      newUpdates = updator;
    }

    const newState = { ...this.#state, ...newUpdates };

    // Check if update is necessary
    if (
      this.#options.shouldUpdate &&
      !this.#options.shouldUpdate(newState, oldState)
    ) {
      return this.#state;
    }

    this.#state = newState;
    this.#scheduleUpdate(oldState);
    return newState;
  }

  /**
   * Force a re-render without state change
   */
  forceUpdate(): void {
    this.#scheduleUpdate(this.#state);
  }

  /**
   * Schedule an update (batches multiple setState calls)
   */
  #scheduleUpdate(previousState?: TState): void {
    if (this.#isRendering || this.#pendingUpdate) {
      return;
    }

    this.#pendingUpdate = true;

    // Use microtask for batching updates
    queueMicrotask(() => {
      if (this.#pendingUpdate && this.isConnected) {
        this.#performUpdate(previousState);
      }
    });
  }

  /**
   * Perform the actual update
   */
  #performUpdate(previousState?: TState): void {
    this.#isRendering = true;
    this.#pendingUpdate = false;

    const wasFirstRender = !this.#hasRendered;
    const prevState = previousState || this.#state;

    try {
      this.#updateDOM();
      this.#hasRendered = true;

      if (!wasFirstRender && this.componentDidUpdate) {
        this.componentDidUpdate(this.#state, prevState);
      }
    } catch (error) {
      console.error("Error during component update:", error);
    } finally {
      this.#isRendering = false;
    }
  }

  static #trustedTypesPolicy = typeof window !== "undefined" && window.trustedTypes
    ? (() => {
        try {
          return window.trustedTypes.createPolicy("reactive-component", {
            createHTML: (string: string) => string,
          });
        } catch {
          return null;
        }
      })()
    : null;

  #safeSetInnerHTML(element: Element, html: string): void {
    element.innerHTML = ReactiveComponent.#trustedTypesPolicy
      ? (ReactiveComponent.#trustedTypesPolicy.createHTML(html) as any)
      : html;
  }

  /**
   * Update the DOM with new render result
   */
  #updateDOM(): void {
    if (!this.#shadow) {
      this.#shadow = this.shadowRoot || this.attachShadow({ mode: "open" });
      this.#setupEventDelegation();
    }

    this.#shadow.replaceChildren();
    const renderResult = this.render();

    if (typeof renderResult === "string") {
      const template = document.createElement("template");
      this.#safeSetInnerHTML(template, renderResult);
      this.#shadow.appendChild(template.content.cloneNode(true));
    } else if (renderResult) {
      this.#shadow.appendChild(renderResult);
    }
  }

  /**
   * Setup event delegation on shadow root with proper cleanup support
   */
  #setupEventDelegation(): void {
    this.#eventTypes.forEach((eventType) => {
      const listener = this.#handleDelegatedEvent.bind(this);
      this.#delegatedEventListeners.set(eventType, listener);
      this.#shadow.addEventListener(eventType, listener, {
        passive: !["mousedown", "keydown", "submit"].includes(eventType),
      });
    });
  }

  /**
   * Handle delegated events using React Atomic pattern
   */
  #handleDelegatedEvent(e: Event): void {
    const target = e.target as Element;
    if (!target) return;

    const handlerAttribute = `data-${e.type}`;
    let element: Element | null = target;
    
    while (element && this.#shadow.contains(element)) {
      const handlerName = element.getAttribute(handlerAttribute);
      if (handlerName && typeof (this as any)[handlerName] === "function") {
        (this as any)[handlerName](e);
        break;
      }
      element = element.parentElement;
    }
  }

  /**
   * Lifecycle method - called when component is connected
   */
  connectedCallback(): void {
    // Connect to stores if provided
    if (this._stores && this._stores.length > 0) {
      this._storeListeners = [];

      this._stores.forEach((store) => {
        // Direct connection - store.addListener(this.setState)
        const boundSetState = this.setState.bind(this) as Function;
        store.addListener(boundSetState);
        this._storeListeners!.push({ store, listener: boundSetState });

        // Initialize with current store state
        const initialState = store.getState();
        this.setState(initialState);
      });
    }

    // Initial render (no previous state for first render)
    this.#performUpdate();

    this.componentDidMount?.();
  }
  /**
   * Lifecycle method - called when component is disconnected
   */
  disconnectedCallback(): void {
    if (this.#shadow && this.#delegatedEventListeners.size > 0) {
      this.#delegatedEventListeners.forEach((listener, eventType) => {
        this.#shadow.removeEventListener(eventType, listener);
      });
      this.#delegatedEventListeners.clear();
    }

    if (this._storeListeners?.length) {
      this._storeListeners.forEach(({ store, listener }) => {
        store.removeListener(listener);
      });
      this._storeListeners = [];
    }
  }

  /**
   * Optional lifecycle method - called after component updates
   * Override this method to perform side effects after the component updates
   */
  componentDidUpdate?(newState: TState, previousState: TState): void;

  /**
   * Optional lifecycle method - called after component is mounted (first render)
   * Override this method to perform setup logic after the component is added to DOM
   */
  componentDidMount?(): void;

  /**
   * Abstract render method - must be implemented by subclasses
   */
  abstract render(): string | DocumentFragment | Element;
}

/**
 * Generic render function for ReactiveHTMLElement components
 * Creates and displays a component with specified componentName and optional stores
 */
export function render<T extends ReactiveComponent>(
  componentName: string,
  props: Record<string, any> = {},
  stores?: Array<any>
): T {
  const element = document.createElement(componentName);

  // Assign all props as attributes using Object.keys
  const { appendTo = document.body, ...restProps } = props;
  Object.keys(restProps).forEach((key) => {
    const value = restProps[key];

    // Handle different data types
    if (value != null) {
      const stringValue =
        typeof value === "object" ? JSON.stringify(value) : String(value);

      element.setAttribute(key, stringValue);
    }
  });

  // Attach stores to element if provided
  if (stores && stores.length > 0) {
    (element as any)._stores = stores;
  }

  // Append to document body
  if (appendTo instanceof HTMLElement) {
    appendTo.appendChild(element);
  }

  return element as T;
}
