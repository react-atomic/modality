// Fixture: a well-formed command module — exactly one *Command export.
const runFoo = async (): Promise<void> => undefined;

export const fooCommand = {
  name: "foo",
  summary: "fixture command",
  execute: runFoo,
};
