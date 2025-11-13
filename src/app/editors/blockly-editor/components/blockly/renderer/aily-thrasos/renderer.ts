import * as Blockly from "blockly/core";
import { ConstantProvider } from "./constant";

export class Renderer extends Blockly.thrasos.Renderer {

  constructor(name: string) {
    super(name);
  }

  override makeConstants_() {
    return new ConstantProvider();
  }

}

Blockly.blockRendering.register('aily-thrasos', Renderer);
