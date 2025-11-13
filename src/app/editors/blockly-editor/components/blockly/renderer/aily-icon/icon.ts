import * as Blockly from "blockly";
import { ISerializable } from 'blockly';

export class Icon extends Blockly.icons.Icon implements ISerializable {
  configImageElement;

  state: {
    type: 'images' | 'i';
    width: number;
    height: number;
    alt?: string;
    src: string;
    class?: string;
  } = {
    type: 'images',
    width: 40,
    height: 30,
    src: 'https://picsum.photos/40/30?r=1',
    alt: '*',
    class: '',
  };

  constructor(sourceBlock) {
    super(sourceBlock);
  }

  override getType() {
    return new Blockly.icons.IconType('AilyIcon');
  }

  override getSize() {
    return new Blockly.utils.Size(this.state.width, this.state.height);
  }

  override isShownWhenCollapsed() {
    return false;
  }

  // override getWeight() {
  //   return 10;
  // }

  override initView(pointerdownListener) {
    if (this.svgRoot) return;

    super.initView(pointerdownListener);

    setTimeout(() => {
      this.updateView();
    }, 0);
  }

  updateView() {
    // Blockly.utils.dom.createSvgElement(
    //   Blockly.utils.Svg.CIRCLE,
    //   {
    //     'class': 'my-css-class',
    //     'r': '18',
    //     'cx': '18',
    //     'cy': '18',
    //   },
    //   this.svgRoot
    // );

    this.configImageElement = Blockly.utils.dom.createSvgElement(
      Blockly.utils.Svg.IMAGE,
      {
        'width': this.state.width + 'px',
        'height': this.state.height + 'px',
        'alt': '*',
      },
      this.svgRoot,
    );
    this.configImageElement.setAttributeNS(
      Blockly.utils.dom.XLINK_NS,
      'xlink:href',
      this.state.src,
    );
  }

  override dispose() {
    super.dispose();
  }

  loadState(state: any): void {
    this.state = state;
  }

  saveState(doFullSerialization: boolean): any {
    return this.state;
  }
}
