import { z } from "zod";

// Empty schema for no parameters
export const emptySchema = z.object({}).describe("No parameters required");
export type EmptyType = z.infer<typeof emptySchema>;
