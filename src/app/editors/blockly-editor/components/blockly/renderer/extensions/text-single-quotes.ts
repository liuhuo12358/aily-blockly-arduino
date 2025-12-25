import * as Blockly from 'blockly/core';

/** Type of a block that has SINGLE_QUOTE_IMAGE_MIXIN */
type SingleQuoteImageBlock = Blockly.Block & SingleQuoteImageMixin;
interface SingleQuoteImageMixin extends SingleQuoteImageMixinType {}
type SingleQuoteImageMixinType = typeof SINGLE_QUOTE_IMAGE_MIXIN;

const SINGLE_QUOTE_IMAGE_MIXIN = {
  /**
   * Image data URI of an LTR opening single quote (same as RTL closing single
   * quote). Using SVG for better scalability.
   */
  SINGLE_QUOTE_IMAGE_LEFT_DATAURI:
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAYAAAAKCAQAAAA9B+e4AAAACXBIWXMAAAAAAAAAAQCEeRdzAAAAVklEQVR4nGNgAIP/Yv+3/neHMDX//////r8ZiKkCZJ5jgCr59P/jfyYI0wsoHgYTLwJyVv6f9t8SxCn4DwMKDP/94Bxnhv+McI4gSCHv/4z/Jf8VGRgAbOBExIKh0UUAAAAASUVORK5CYII=',
  /**
   * Image data URI of an LTR closing single quote (same as RTL opening single
   * quote). Using SVG for better scalability.
   */
  SINGLE_QUOTE_IMAGE_RIGHT_DATAURI:
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAYAAAAKCAQAAAA9B+e4AAAACXBIWXMAAAAAAAAAAQCEeRdzAAAAW0lEQVR4nGNgYPjv87/kf8h/RgYgM+Q/BEwFcdr+w4AAw/9MOEeD4T/j/4T/s/8/BnI0GSDg/20ghxPClPz/9383hCkIFP3+nw3ELPv/6//L/1wQ8a7/5VCNDACm6kTshOL1MQAAAABJRU5ErkJggg==',
  /**
   * Pixel width of SINGLE_QUOTE_IMAGE_LEFT_DATAURI and SINGLE_QUOTE_IMAGE_RIGHT_DATAURI.
   */
  SINGLE_QUOTE_IMAGE_WIDTH: 6,
  /**
   * Pixel height of SINGLE_QUOTE_IMAGE_LEFT_DATAURI and SINGLE_QUOTE_IMAGE_RIGHT_DATAURI.
   */
  SINGLE_QUOTE_IMAGE_HEIGHT: 10,

  /**
   * Inserts appropriate single quote images before and after the named field.
   *
   * @param fieldName The name of the field to wrap with single quotes.
   */
  quoteField_: function (this: SingleQuoteImageBlock, fieldName: string) {
    for (let i = 0, input; (input = this.inputList[i]); i++) {
      for (let j = 0, field; (field = input.fieldRow[j]); j++) {
        if (fieldName === field.name) {
          input.insertFieldAt(j, this.newSingleQuote_(true));
          input.insertFieldAt(j + 2, this.newSingleQuote_(false));
          return;
        }
      }
    }
    console.warn(
      'field named "' + fieldName + '" not found in ' + this.toDevString(),
    );
  },

  /**
   * A helper function that generates a FieldImage of an opening or
   * closing single quote. The selected quote will be adapted for RTL blocks.
   *
   * @param open If the image should be open quote (' in LTR).
   *     Otherwise, a closing quote is used (' in LTR).
   * @returns The new field.
   */
  newSingleQuote_: function (this: SingleQuoteImageBlock, open: boolean): Blockly.FieldImage {
    const isLeft = this.RTL ? !open : open;
    const dataUri = isLeft
      ? this.SINGLE_QUOTE_IMAGE_LEFT_DATAURI
      : this.SINGLE_QUOTE_IMAGE_RIGHT_DATAURI;
    return Blockly.fieldRegistry.fromJson({
      type: 'field_image',
      src: dataUri,
      width: this.SINGLE_QUOTE_IMAGE_WIDTH,
      height: this.SINGLE_QUOTE_IMAGE_HEIGHT,
      alt: isLeft ? '\u2018' : '\u2019',
    }) as Blockly.FieldImage;
  },
};

/**
 * Wraps TEXT field with images of single quote characters.
 */
const SINGLE_QUOTES_EXTENSION = function (this: SingleQuoteImageBlock) {
  this.mixin(SINGLE_QUOTE_IMAGE_MIXIN);
  this.quoteField_('CHAR');
};

// Register the extension
Blockly.Extensions.register('text_single_quotes', SINGLE_QUOTES_EXTENSION);

// Register the mixin for reuse
Blockly.Extensions.registerMixin('single_quote_image_mixin', SINGLE_QUOTE_IMAGE_MIXIN);

