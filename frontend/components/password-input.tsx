"use client";

import { useId, useState, type ComponentProps } from "react";

type Props = Omit<ComponentProps<"input">, "type"> & {
  id?: string;
};

/** Password field with a show/hide control, matching Fan Engage's reset form. */
export function PasswordInput({ id, className = "", ...rest }: Props) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [visible, setVisible] = useState(false);

  return (
    <span className="relative block">
      <input
        {...rest}
        id={inputId}
        type={visible ? "text" : "password"}
        className={`${className} pr-20`}
      />
      <button
        type="button"
        aria-controls={inputId}
        aria-pressed={visible}
        aria-label={visible ? "Hide password" : "Show password"}
        onClick={() => setVisible((current) => !current)}
        className="absolute inset-y-0 right-1 my-1 min-w-16 rounded-lg px-3 text-xs font-medium text-iron/80 hover:bg-iron/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iron"
      >
        {visible ? "Hide" : "Show"}
      </button>
    </span>
  );
}
