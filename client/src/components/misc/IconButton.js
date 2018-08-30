import * as React from "react";
import { StyleSheet, css } from "aphrodite";

export const IconButton = ({
  icon,
  label,
  className,
  onClick
}) =>
  <button
    className={`${css(styles.button)} ${className}`}
    onClick={onClick}
    title={label}>
    <i className={`s7 s7-${icon} ${css(styles.icon)}`} />
  </button>

export default IconButton;

const styles = StyleSheet.create({
  button: {
    display: "inline",
    border: "none",
    background: "transparent",
    color: "inherit",
    verticalAlign: "middle",
    padding: 8,
    paddingBottom: 5,
    cursor: "pointer"
  },

  icon: {
    fontWeight: 600,
  }
});