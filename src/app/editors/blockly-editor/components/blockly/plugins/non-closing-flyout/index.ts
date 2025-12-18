/**
 * @fileoverview Custom flyout that stays open after dragging a block.
 * This plugin prevents the flyout from auto-closing when a block is dragged out.
 */

import * as Blockly from 'blockly/core';

/**
 * A vertical flyout that doesn't auto-close when blocks are dragged out.
 */
export class NonClosingFlyout extends Blockly.VerticalFlyout {
  constructor(workspaceOptions: Blockly.Options) {
    super(workspaceOptions);
    // Set autoClose to false to keep the flyout open after dragging a block
    this.autoClose = false;
  }
}

/**
 * A horizontal flyout that doesn't auto-close when blocks are dragged out.
 */
export class NonClosingHorizontalFlyout extends Blockly.HorizontalFlyout {
  constructor(workspaceOptions: Blockly.Options) {
    super(workspaceOptions);
    // Set autoClose to false to keep the flyout open after dragging a block
    this.autoClose = false;
  }
}

// Register the custom flyout for vertical toolbox
Blockly.registry.register(
  Blockly.registry.Type.FLYOUTS_VERTICAL_TOOLBOX,
  'non-closing-flyout',
  NonClosingFlyout,
  true // Allow overwrite if already registered
);

// Register the custom flyout for horizontal toolbox
Blockly.registry.register(
  Blockly.registry.Type.FLYOUTS_HORIZONTAL_TOOLBOX,
  'non-closing-flyout',
  NonClosingHorizontalFlyout,
  true // Allow overwrite if already registered
);
