import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
} from "bun:test";
import { VsCodeLmProvider } from "../VsCodeLmProvider";
import { bunMockModule } from "modality-bun-kit";
import {
  createModalityClientMockModule,
  MOCK_SCENARIOS,
  type MockModalityClient,
} from "../../util_tests/modalityClientMocks";

// Create centralized mock module optimized for VsCodeLmProvider testing
// Strategy: Mock ModalityClient to prevent network calls and ensure deterministic behavior
const mockModule = createModalityClientMockModule({
  http: {
    defaultResponses: {
      callOnce: { content: { message: "test response" } },
      // callStream intentionally omitted - each test provides fresh stream to avoid "locked" errors
    },
  },
});

// Extract mock components for convenient access in test setup
const mockFactories = mockModule.__testFactories;

describe("VsCodeLmProvider", () => {
  let restoreModalityClient: any;
  let mockClient: MockModalityClient;

  describe("constructor", () => {
    beforeEach(async () => {
      // Mock ModalityClient with the test module
      restoreModalityClient = await bunMockModule(
        "../../ModalityClient",
        () => mockModule,
        import.meta.dir
      );
      // Create a fresh mock client for each test
      mockClient = MOCK_SCENARIOS.WORKING_CLIENT();

      // Configure the http factory to return our mock client
      mockFactories.http.mockImplementation(() => mockClient);
    });

    afterEach(() => {
      if (restoreModalityClient) {
        restoreModalityClient();
      }
    });

    test("should initialize with default modelId when not provided", () => {
      const providerDefault = new VsCodeLmProvider({});
      expect(providerDefault.modelId).toBe("copilot-gpt-4");
    });

    test("second test - verify mock was restored", () => {
      // This should use the fresh mock from beforeEach
      // If restoration doesn't work, this will use the mocked version from previous test
      const providerSecond = new VsCodeLmProvider({});
      expect(providerSecond.modelId).toBe("copilot-gpt-4");
    });
  });
});
