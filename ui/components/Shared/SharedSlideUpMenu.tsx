import classNames from "classnames"
import React, { ReactElement } from "react"

interface Props {
  isOpen: boolean
  close: () => void
  children: React.ReactNode
  customSize?: string
  title?: string
  size: "small" | "medium" | "large" | "custom"
}

export default function SharedSlideUpMenu(props: Props): ReactElement {
  const { isOpen, close, size, children, customSize, title } = props

  let menuHeight = "536px"
  if (size === "large") {
    menuHeight = "600px"
  } else if (size === "small") {
    menuHeight = "268px"
  } else if (size === "custom") {
    menuHeight = customSize || "600px"
  }

  return (
    <div
      className={classNames("slide_up_menu", {
        large: size === "large",
        closed: !isOpen,
      })}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "row",
        }}
      >
        <div className="slide_up_menu_title">{title || ""}</div>
        <button
          type="button"
          className="icon_close"
          onClick={close}
          aria-label="Close menu"
        />
      </div>
      {children}
      <style jsx>
        {`
          .slide_up_menu {
            width: 100%;
            height: ${menuHeight};
            overflow-y: auto;
            overflow-x: hidden;
            border-radius: 16px;
            background-color: var(--green-95);
            position: fixed;
            left: 0px;
            right: 0px;
            bottom: 0px;
            z-index: 999;
            transform: translateY(0); /* open by default */
            transition: transform cubic-bezier(0.19, 1, 0.22, 1) 0.445s;
            padding-top: 24px;
            box-sizing: border-box;
          }
          .slide_up_menu_title {
            height: 20px;
            color: var(--green-40);
            width: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .icon_close {
            mask-image: url("./images/close.svg");
            mask-size: cover;
            width: 12px;
            height: 12px;
            position: absolute;
            right: 24px;
            background-color: var(--green-20);
            z-index: 1;
          }
          .icon_close:hover {
            background-color: #fff;
          }
          .large {
            background-color: var(--hunter-green);
          }
          .open_animate {
            transform: translateY(0px);
            animation: slideUp cubic-bezier(0.19, 1, 0.22, 1) 0.445s;
            animation-direction: forward;
          }
          .closed {
            transform: translateY(${menuHeight});
          }
        `}
      </style>
    </div>
  )
}

SharedSlideUpMenu.defaultProps = {
  size: "medium",
}
