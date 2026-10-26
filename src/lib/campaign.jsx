import { createContext, useContext } from 'react'

/* The signed-in user and the campaign being viewed. */
export const CampaignCtx = createContext({ user: null, campaign: null, member: null, refresh: () => {} })
export const useCampaign = () => useContext(CampaignCtx)
