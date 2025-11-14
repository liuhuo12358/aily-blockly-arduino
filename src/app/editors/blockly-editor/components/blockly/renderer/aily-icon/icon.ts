import * as Blockly from "blockly";
import { ISerializable } from 'blockly';

export class Icon extends Blockly.icons.Icon implements ISerializable {
  _defaultState = {
    type: 'i',
    width: 40,
    height: 30,
    src: 'fa-solid fa-bed-pulse',
    alt: '*',
    class: '',
    fontSize: '30px',
    color: 'white',
  }

  state: {
    type: 'image' | 'i' | 'svg';
    width: number;
    height: number;
    alt?: string;
    src: string;
    class?: string;
    fontSize?: string;
    color?: string;
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

    switch (this.state.type) {
      case "image":
        Blockly.utils.dom.createSvgElement(
          Blockly.utils.Svg.IMAGE,
          {
            'class': this.state.class,
            'width': this.state.width + 'px',
            'height': this.state.height + 'px',
            'alt': '*',
          },
          this.svgRoot,
        ).setAttributeNS(
          Blockly.utils.dom.XLINK_NS,
          'xlink:href',
          this.state.src,
        );
        break;
      case "svg":
        Blockly.utils.dom.createSvgElement(
          Blockly.utils.Svg.SVG,
          {
            'class': this.state.class,
            'width': this.state.width,
            'height': this.state.height,
            'xmlns': 'http://www.w3.org/2000/svg',
            'viewBox': '0 0 512 512',
            'fill': this.state.color || this._defaultState.color,
          },
          this.svgRoot,
        ).innerHTML = this.state.src;
        break;
      case "i":
        this.svgRoot.innerHTML = `<foreignObject class="${this.state.class}" width="${this.state.width}" height="${this.state.height}" font-size="${this.state.fontSize}" color="${this.state.color}" style="line-height: 1;">
                                    <body xmlns="http://www.w3.org/1999/xhtml">
                                      <i class="${this.state.src}"></i>
                                    </body>
                                  </foreignObject>`;
        break;
    }

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
