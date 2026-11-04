export class MockCamera {
  async capture() { return Buffer.from("mock-jpeg-bytes"); }
}
