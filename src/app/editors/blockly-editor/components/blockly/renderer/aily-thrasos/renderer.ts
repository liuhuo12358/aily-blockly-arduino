import * as Blockly from "blockly";
import { ConstantProvider } from "./constant";
import { PathObject } from './path_object';
// import { Drawer } from './drawer';
import { RenderInfo } from './info';
import { ISerializable } from 'blockly';

type BlockSvg = Blockly.BlockSvg;
type BlockStyle = Blockly.Theme.BlockStyle;

export class Renderer extends Blockly.thrasos.Renderer {

  constructor(name: string) {
    super(name);
  }

  override makeConstants_() {
    return new ConstantProvider();
  }

  override makeRenderInfo_(block: any): Blockly.thrasos.RenderInfo {
    return new Blockly.thrasos.RenderInfo(this, block);
    // return new RenderInfo(this, block);
  }

  // override makePathObject(root: SVGElement, style: BlockStyle): PathObject {
  //   return new PathObject(root, style, this.getConstants() as ConstantProvider);
  // }

  // protected override makeDrawer_(
  //   block: BlockSvg,
  //   info: RenderInfo,
  // ): Drawer {
  //   return new Drawer(block, info as RenderInfo);
  // }
}

Blockly.blockRendering.register('aily-thrasos', Renderer);
