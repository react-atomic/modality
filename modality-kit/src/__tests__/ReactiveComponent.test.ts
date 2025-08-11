import { describe, it, expect, afterEach } from 'bun:test';
import { ReactiveHTMLElement, render } from '../ReactiveComponent';

// Define a simple test component
class TestComponent extends ReactiveHTMLElement<{ count: number }> {
  static tagName = 'test-component';
  constructor() {
    super({ initialState: { count: 0 } });
  }

  render() {
    return `
      <div>
        <p>Count: ${this.state.count}</p>
        <button data-click="increment">Increment</button>
      </div>
    `;
  }

  increment() {
    this.setState(prevState => ({ count: prevState.count + 1 }));
  }
}

// Define the custom element if it doesn't exist
if (!customElements.get(TestComponent.tagName)) {
  customElements.define(TestComponent.tagName, TestComponent);
}

// Cleanup DOM after each test
afterEach(() => {
  document.body.innerHTML = '';
});

describe('ReactiveHTMLElement', () => {
  it('should render with initial state', async () => {
    const el = document.createElement('test-component') as TestComponent;
    document.body.appendChild(el);

    await new Promise(resolve => queueMicrotask(resolve));

    const p = el.shadowRoot?.querySelector('p');
    expect(p?.textContent).toBe('Count: 0');
  });

  it('should update state and re-render on setState', async () => {
    const el = document.createElement('test-component') as TestComponent;
    document.body.appendChild(el);
    await new Promise(resolve => queueMicrotask(resolve));

    el.setState({ count: 5 });
    await new Promise(resolve => queueMicrotask(resolve));

    const p = el.shadowRoot?.querySelector('p');
    expect(p?.textContent).toBe('Count: 5');
  });

  it('should handle functional setState', async () => {
    const el = document.createElement('test-component') as TestComponent;
    document.body.appendChild(el);
    await new Promise(resolve => queueMicrotask(resolve));

    el.setState(prevState => ({ count: prevState.count + 10 }));
    await new Promise(resolve => queueMicrotask(resolve));

    const p = el.shadowRoot?.querySelector('p');
    expect(p?.textContent).toBe('Count: 10');
  });

  it('should handle event delegation', async () => {
    const el = document.createElement('test-component') as TestComponent;
    document.body.appendChild(el);
    await new Promise(resolve => queueMicrotask(resolve));

    const button = el.shadowRoot?.querySelector('button');
    button?.click();
    await new Promise(resolve => queueMicrotask(resolve));

    const p = el.shadowRoot?.querySelector('p');
    expect(p?.textContent).toBe('Count: 1');
  });

  it('should not update if shouldUpdate returns false', async () => {
    class NoUpdateComponent extends ReactiveHTMLElement<{ count: number }> {
      static tagName = 'no-update-component';
      constructor() {
        super({
          initialState: { count: 0 },
          shouldUpdate: (newState, oldState) => newState.count !== oldState.count,
        });
      }
      render() {
        return `<p>${this.state.count}</p>`;
      }
    }
    if (!customElements.get(NoUpdateComponent.tagName)) {
        customElements.define(NoUpdateComponent.tagName, NoUpdateComponent);
    }

    const el = document.createElement('no-update-component') as NoUpdateComponent;
    document.body.appendChild(el);
    await new Promise(resolve => queueMicrotask(resolve));

    expect(el.shadowRoot?.querySelector('p')?.textContent).toBe('0');
    el.setState({ count: 0 }); // should not trigger re-render
    await new Promise(resolve => queueMicrotask(resolve));

    expect(el.shadowRoot?.querySelector('p')?.textContent).toBe('0');
    el.setState({ count: 1 }); // should trigger re-render
    await new Promise(resolve => queueMicrotask(resolve));

    expect(el.shadowRoot?.querySelector('p')?.textContent).toBe('1');
  });

  it('should connect to and disconnect from stores', async () => {
    const mockStore = {
      state: { value: 'initial' },
      listeners: new Set<Function>(),
      getState() {
        return this.state;
      },
      addListener(listener: Function) {
        this.listeners.add(listener);
      },
      removeListener(listener: Function) {
        this.listeners.delete(listener);
      },
      updateState(newState: any) {
        this.state = newState;
        this.listeners.forEach(l => l(this.state, {}, this.state));
      }
    };

    class StoreComponent extends ReactiveHTMLElement {
        static tagName = 'store-component';
      constructor() {
        super();
        this._stores = [mockStore];
      }
      render() {
        return `<div>${this.state.value}</div>`;
      }
    }
    if (!customElements.get(StoreComponent.tagName)) {
        customElements.define(StoreComponent.tagName, StoreComponent);
    }

    const el = document.createElement('store-component') as StoreComponent;
    document.body.appendChild(el);
    await new Promise(resolve => queueMicrotask(resolve));

    expect(el.shadowRoot?.querySelector('div')?.textContent).toBe('initial');
    expect(mockStore.listeners.size).toBe(1);

    mockStore.updateState({ value: 'updated' });
    await new Promise(resolve => queueMicrotask(resolve));

    expect(el.shadowRoot?.querySelector('div')?.textContent).toBe('updated');

    el.remove(); // Triggers disconnectedCallback
    expect(mockStore.listeners.size).toBe(0);
  });

  it('should force re-render on forceUpdate', async () => {
    let renderCount = 0;
    class ForceUpdateComponent extends ReactiveHTMLElement {
      static tagName = 'force-update-component';
      render() {
        renderCount++;
        return `<p>Render: ${renderCount}</p>`;
      }
    }
    if (!customElements.get(ForceUpdateComponent.tagName)) {
        customElements.define(ForceUpdateComponent.tagName, ForceUpdateComponent);
    }

    const el = document.createElement('force-update-component') as ForceUpdateComponent;
    document.body.appendChild(el);
    await new Promise(resolve => queueMicrotask(resolve));

    expect(renderCount).toBe(1);
    expect(el.shadowRoot?.querySelector('p')?.textContent).toBe('Render: 1');

    el.forceUpdate();
    await new Promise(resolve => queueMicrotask(resolve));

    expect(renderCount).toBe(2);
    expect(el.shadowRoot?.querySelector('p')?.textContent).toBe('Render: 2');
  });

  it('should render a DocumentFragment', async () => {
    class FragmentComponent extends ReactiveHTMLElement {
      static tagName = 'fragment-component';
      render() {
        const frag = document.createDocumentFragment();
        const p = document.createElement('p');
        p.textContent = 'fragment';
        frag.appendChild(p);
        return frag;
      }
    }
    if (!customElements.get(FragmentComponent.tagName)) {
        customElements.define(FragmentComponent.tagName, FragmentComponent);
    }
    const el = document.createElement('fragment-component');
    document.body.appendChild(el);
    await new Promise(resolve => queueMicrotask(resolve));

    const p = el.shadowRoot?.querySelector('p');
    expect(p?.textContent).toBe('fragment');
  });

  it('should call componentDidMount after initial render', async () => {
    let didMountCalled = false;
    
    class DidMountComponent extends ReactiveHTMLElement<{ count: number }> {
      static tagName = 'did-mount-component';
      constructor() {
        super({ initialState: { count: 0 } });
      }

      render() {
        return `<p>Count: ${this.state.count}</p>`;
      }

      componentDidMount() {
        didMountCalled = true;
      }
    }
    
    if (!customElements.get(DidMountComponent.tagName)) {
      customElements.define(DidMountComponent.tagName, DidMountComponent);
    }

    const el = document.createElement('did-mount-component') as DidMountComponent;
    document.body.appendChild(el);
    await new Promise(resolve => queueMicrotask(resolve));

    expect(didMountCalled).toBe(true);
  });

  it('should call componentDidUpdate after state changes but not on initial render', async () => {
    let updateCallCount = 0;
    let lastNewState: any = null;
    let lastPreviousState: any = null;
    
    class DidUpdateComponent extends ReactiveHTMLElement<{ count: number }> {
      static tagName = 'did-update-component';
      constructor() {
        super({ initialState: { count: 0 } });
      }

      render() {
        return `<p>Count: ${this.state.count}</p>`;
      }

      componentDidUpdate(newState: { count: number }, previousState: { count: number }) {
        updateCallCount++;
        lastNewState = newState;
        lastPreviousState = previousState;
      }
    }
    
    if (!customElements.get(DidUpdateComponent.tagName)) {
      customElements.define(DidUpdateComponent.tagName, DidUpdateComponent);
    }

    const el = document.createElement('did-update-component') as DidUpdateComponent;
    document.body.appendChild(el);
    await new Promise(resolve => queueMicrotask(resolve));

    // componentDidUpdate should not be called on initial render
    expect(updateCallCount).toBe(0);

    // Update state - should trigger componentDidUpdate
    el.setState({ count: 1 });
    await new Promise(resolve => queueMicrotask(resolve));

    expect(updateCallCount).toBe(1);
    expect(lastNewState).toEqual({ count: 1 });
    expect(lastPreviousState).toEqual({ count: 0 });

    // Update state again
    el.setState({ count: 2 });
    await new Promise(resolve => queueMicrotask(resolve));

    expect(updateCallCount).toBe(2);
    expect(lastNewState).toEqual({ count: 2 });
    expect(lastPreviousState).toEqual({ count: 1 });
  });

  it('should call componentDidUpdate with correct state values after forceUpdate', async () => {
    let updateCallCount = 0;
    let lastNewState: any = null;
    let lastPreviousState: any = null;
    
    class ForceUpdateComponent extends ReactiveHTMLElement<{ count: number }> {
      static tagName = 'force-update-did-update-component';
      constructor() {
        super({ initialState: { count: 5 } });
      }

      render() {
        return `<p>Count: ${this.state.count}</p>`;
      }

      componentDidUpdate(newState: { count: number }, previousState: { count: number }) {
        updateCallCount++;
        lastNewState = newState;
        lastPreviousState = previousState;
      }
    }
    
    if (!customElements.get(ForceUpdateComponent.tagName)) {
      customElements.define(ForceUpdateComponent.tagName, ForceUpdateComponent);
    }

    const el = document.createElement('force-update-did-update-component') as ForceUpdateComponent;
    document.body.appendChild(el);
    await new Promise(resolve => queueMicrotask(resolve));

    // Initial render - no componentDidUpdate
    expect(updateCallCount).toBe(0);

    // Force update - should trigger componentDidUpdate
    el.forceUpdate();
    await new Promise(resolve => queueMicrotask(resolve));

    expect(updateCallCount).toBe(1);
    expect(lastNewState).toEqual({ count: 5 });
    expect(lastPreviousState).toEqual({ count: 5 });
  });
});

describe('render function', () => {
  it('should create and append a component', async () => {
    const el = render<TestComponent>('test-component');
    expect(el).toBeInstanceOf(TestComponent);
    expect(document.body.contains(el)).toBe(true);

    await new Promise(resolve => queueMicrotask(resolve));
    expect(el.shadowRoot?.querySelector('p')?.textContent).toBe('Count: 0');
  });

  it('should assign props as attributes', () => {
    const props = {
      id: 'my-comp',
      'data-test': 'true',
      myprop: JSON.stringify({ a: 1 }),
    };
    const el = render<TestComponent>('test-component', props);
    expect(el.id).toBe('my-comp');
    expect(el.getAttribute('data-test')).toBe('true');
    expect(el.getAttribute('myprop')).toBe('{"a":1}');
  });
});
