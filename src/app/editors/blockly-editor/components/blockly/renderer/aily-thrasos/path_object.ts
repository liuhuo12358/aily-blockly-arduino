import * as Blockly from "blockly";
import { ConstantProvider } from './constant';

export class PathObject extends Blockly.blockRendering.PathObject {
  configImageElement: SVGImageElement | null = null;
  configGElement: SVGElement | null = null;

  constructor(
    root: SVGElement,
    style: Blockly.Theme.BlockStyle,
    constants: ConstantProvider,
  ) {
    super(root, style, constants);

    this.constants = constants;

    this.drawConfigGImage();
  }

  drawConfigGImage() {
    this.configGElement = Blockly.utils.dom.createSvgElement(
      Blockly.utils.Svg.G,
      {
        'class': 'configIconG',
        'transform': "translate(10,15)",
      },
      this.svgRoot,
    );

    this.configImageElement = Blockly.utils.dom.createSvgElement(
      Blockly.utils.Svg.IMAGE,
      {
        'height': 20 + 'px',
        'width': 20 + 'px',
        'alt': '*',
      },
      this.configGElement,
    );
    this.configImageElement.setAttributeNS(
      Blockly.utils.dom.XLINK_NS,
      'xlink:href',
      'https://picsum.photos/20/20?r=2',
    );
  }
}
