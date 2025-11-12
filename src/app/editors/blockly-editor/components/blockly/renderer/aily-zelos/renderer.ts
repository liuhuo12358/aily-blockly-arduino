import * as Blockly from "blockly/core";
import { ConstantProvider } from "./constant";

export class Renderer extends Blockly.zelos.Renderer {

  constructor(name: string) {
    super(name);
  }

  override makeConstants_(): ConstantProvider {
    return new ConstantProvider();
  }

}

Blockly.blockRendering.register('aily-zelos', Renderer);
