/**
 * ReactiveComponent - Base class for React-like Web Components
 * Adds state management and automatic re-rendering capabilities
 */

interface ReactiveComponentOptions<T> {
  initialState?: T;
  shouldUpdate?: (newState: T, oldState: T) => boolean;
}

type StateCallbackHandler<TState> = (prevState: TState) => Partial<TState>;
type StateType<TState> =
  | Partial<TState>
  | StateCallbackHandler<TState>
  | TState;

/**
 * Base class for reactive web components
 */
export abstract class ReactiveComponent<TState = any> extends HTMLElement {
  #state: TState;
  #isRendering = false;
  #pendingUpdate = false;
  #hasRendered = false;
  #shadow!: ShadowRoot;
  #options: ReactiveComponentOptions<TState>;
  #delegatedEventListeners: { [key: string]: EventListener } = {};
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

  constructor(options: ReactiveComponentOptions<TState> = {}) {
    super();
    this.#options = options;
    this.#state = options.initialState || ({} as TState);
  }

  /**
   * Get current state (immutable)
   */
  get state(): Readonly<TState> {
    return Object.freeze({ ...this.#state });
  }

  /**
   * Update state and trigger re-render (React-like setState)
   * Also compatible with reshow-flux-base listener: setState(state, action, prevState)
   */
  setState(
    updator: StateType<TState>,
    _action?: any,
    prevState?: TState
  ): TState {
    const oldState = prevState || { ...this.#state };

    let newUpdates;
    if (typeof updator === "function") {
      newUpdates = (updator as StateCallbackHandler<TState>)(this.#state);
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
    } else {
      this.#state = newState;

      // Trigger re-render with previous state for componentDidUpdate
      this.#scheduleUpdate(oldState);
      return newState;
    }
  }

  /**
   * Force a re-render without state change
   */
  forceUpdate(): void {
    this.#scheduleUpdate({ ...this.#state });
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
    const prevState = previousState || { ...this.#state };

    try {
      this.#updateDOM();
      this.#hasRendered = true;

      // Call componentDidUpdate lifecycle method after DOM update (but not on first render)
      if (!wasFirstRender && typeof this.componentDidUpdate === "function") {
        this.componentDidUpdate(this.#state, prevState);
      }
    } catch (error) {
      console.error("Error during component update:", error);
    } finally {
      this.#isRendering = false;
    }
  }

  /**
   * Create a TrustedHTML policy for safe HTML insertion
   */
  static #trustedTypesPolicy = (() => {
    if (
      typeof window !== "undefined" &&
      window.trustedTypes &&
      window.trustedTypes.createPolicy
    ) {
      try {
        return window.trustedTypes.createPolicy("reactive-component", {
          createHTML: (string: string) => string,
        });
      } catch (e) {
        // Policy might already exist, try to get existing one
        console.warn("Failed to create trusted types policy:", e);
        return null;
      }
    }
    return null;
  })();

  /**
   * Safely set innerHTML with Trusted Types support
   */
  #safeSetInnerHTML(element: Element, html: string): void {
    if (ReactiveComponent.#trustedTypesPolicy) {
      element.innerHTML = ReactiveComponent.#trustedTypesPolicy.createHTML(
        html
      ) as any;
    } else {
      // Fallback for browsers without Trusted Types support
      element.innerHTML = html;
    }
  }

  /**
   * Update the DOM with new render result
   */
  #updateDOM(): void {
    if (!this.#shadow) {
      this.#shadow = this.shadowRoot || this.attachShadow({ mode: "open" });
      this.#setupEventDelegation();
    }

    // Clear existing content safely (avoid TrustedHTML violations)
    if (
      typeof window !== "undefined" &&
      window.trustedTypes &&
      window.trustedTypes.emptyHTML
    ) {
      this.#shadow.innerHTML = window.trustedTypes.emptyHTML as any;
    } else {
      // Fallback: remove children without innerHTML
      while (this.#shadow.firstChild) {
        this.#shadow.removeChild(this.#shadow.firstChild);
      }
    }

    // Call render method and update DOM
    const renderResult = this.render();

    if (typeof renderResult === "string") {
      // Use safe DOM manipulation with Trusted Types support
      const template = document.createElement("template");
      this.#safeSetInnerHTML(template, renderResult);
      this.#shadow.appendChild(template.content.cloneNode(true));
    } else if (
      renderResult instanceof DocumentFragment ||
      renderResult instanceof Element
    ) {
      this.#shadow.appendChild(renderResult);
    }
  }

  /**
   * Setup event delegation on shadow root with proper cleanup support
   */
  #setupEventDelegation(): void {
    this.#eventTypes.forEach((eventType) => {
      const listener = (e: Event) => {
        this.#handleDelegatedEvent(e);
      };

      // Store listener reference for proper cleanup
      this.#delegatedEventListeners[eventType] = listener;

      // Use passive listeners for better performance (except for events that might need preventDefault)
      const usePassive = !["mousedown", "keydown", "submit"].includes(
        eventType
      );
      this.#shadow.addEventListener(eventType, listener, {
        passive: usePassive,
      });
    });
  }

  /**
   * Handle delegated events using React Atomic pattern
   */
  #handleDelegatedEvent(e: Event): void {
    const eventType = e.type;
    const target = e.target as Element;

    if (!target) return;

    // Find all elements that might handle this event type using data attributes
    const handlerAttribute = `data-${eventType}`;
    const elementsWithHandlers = this.#shadow.querySelectorAll(
      `[${handlerAttribute}]`
    );

    // Check if target matches or is contained within handler elements
    Array.from(elementsWithHandlers).forEach((element) => {
      if (target.isSameNode(element) || element.contains(target)) {
        const handlerName = element.getAttribute(handlerAttribute);

        if (handlerName && typeof (this as any)[handlerName] === "function") {
          // Call the handler method
          (this as any)[handlerName](e);
        }
      }
    });
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

    // Call componentDidMount lifecycle method after initial render
    if (typeof this.componentDidMount === "function") {
      this.componentDidMount();
    }
  }
  /**
   * Lifecycle method - called when component is disconnected
   */
  disconnectedCallback(): void {
    // Clean up event listeners to prevent memory leaks
    if (this.#shadow && Object.keys(this.#delegatedEventListeners).length > 0) {
      this.#eventTypes.forEach((eventType) => {
        const listener = this.#delegatedEventListeners[eventType];
        if (listener) {
          this.#shadow.removeEventListener(eventType, listener);
        }
      });
      this.#delegatedEventListeners = {};
    }

    // Auto cleanup all store listeners to prevent memory leaks
    if (this._storeListeners && this._storeListeners.length > 0) {
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

export type { ReactiveComponentOptions };

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

const lazyStores = { current: {} as any };

export function registerStore(componentName: string, stores: Array<any>): void {
  const connectionSectionElement = document.querySelector(
    "connection-section"
  ) as any;
  if (connectionSectionElement) {
    connectionSectionElement._stores = stores;
  } else {
    lazyStores.current[componentName] = stores;
  }
}

if ("undefined" !== typeof document) {
  document.addEventListener("DOMContentLoaded", () => {
    const promise = Object.keys(lazyStores.current).map(
      async (componentName) => {
        const connectionSectionElement = document.querySelector(
          componentName
        ) as any;
        if (connectionSectionElement) {
          connectionSectionElement._stores = lazyStores.current[componentName];
          delete lazyStores.current[componentName];
        }
      }
    );
    Promise.all(promise);
  });
}
