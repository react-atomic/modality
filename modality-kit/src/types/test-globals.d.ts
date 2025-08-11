// Global declarations for test environment
declare global {
  namespace globalThis {
    var chrome: any;
    var document: any;
    var window: any;
  }

  // TrustedTypes API declarations
  interface TrustedHTML {
    readonly __brand: 'TrustedHTML';
  }

  interface TrustedScript {
    readonly __brand: 'TrustedScript';
  }

  interface TrustedScriptURL {
    readonly __brand: 'TrustedScriptURL';
  }

  interface TrustedTypePolicyOptions {
    createHTML?: (input: string) => string;
    createScript?: (input: string) => string;
    createScriptURL?: (input: string) => string;
  }

  interface TrustedTypePolicy {
    readonly name: string;
    createHTML(input: string): TrustedHTML;
    createScript?(input: string): TrustedScript;
    createScriptURL?(input: string): TrustedScriptURL;
  }

  interface TrustedTypePolicyFactory {
    readonly emptyHTML: TrustedHTML;
    readonly emptyScript: TrustedScript;
    createPolicy(policyName: string, policyOptions: TrustedTypePolicyOptions): TrustedTypePolicy;
    isHTML(value: any): value is TrustedHTML;
    isScript(value: any): value is TrustedScript;
    isScriptURL(value: any): value is TrustedScriptURL;
    getAttributeType(tagName: string, attribute: string): string | null;
    getPropertyType(tagName: string, property: string): string | null;
  }

  interface Window {
    trustedTypes?: TrustedTypePolicyFactory;
  }
}

export {};
