"use client"

import { createContext, useContext } from "react"

/** False for people with view-only access to the property being shown. */
const CanAct = createContext(true)

export const CanActProvider = CanAct.Provider

export function useCanAct() {
  return useContext(CanAct)
}
