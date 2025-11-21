import * as Blockly from 'blockly';
import { Field } from 'blockly';

type BlockSvg = Blockly.BlockSvg;
type RenderInfo = Blockly.thrasos.RenderInfo;
const Types = Blockly.blockRendering.Types;
type InlineInput = Blockly.blockRendering.InlineInput;

export class Drawer extends Blockly.blockRendering.Drawer {
  constructor(block: BlockSvg, info: RenderInfo) {
    super(block, info);
  }

  override drawInternals_() {
    for (let i = 0, row; (row = this.info_.rows[i]); i++) {
      for (let j = 0, elem; (elem = row.elements[j]); j++) {
        if (Types.isInlineInput(elem)) {
          this.drawInlineInput_(elem as InlineInput);
        } else if (Types.isIcon(elem) || Types.isField(elem)) {
          this.layoutField_(elem as Field | any);
        }
      }
    }
  }

}
