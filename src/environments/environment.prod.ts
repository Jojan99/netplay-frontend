/**
 * El sitio desde el que se abre el panel (ver environment.ts): el mismo build
 * sirve en netplay.com.co y en netvula.com.
 */
const SITIO = typeof window !== 'undefined' && /^https:\/\//.test(window.location?.origin ?? '')
  ? window.location.origin
  : 'https://netplay.com.co';

export const environment = {
  production: true,

  rootUrl: `${SITIO}/`,
  rootUrlWeb: `${SITIO}/`,
  urlVerificateUser: `${SITIO}/verifíquelo/user`,
  urlReset: `${SITIO}/reset-password`,
  urlRegister: `${SITIO}/sign-up`,
  urlTickets: "/ticket-detail",
  urlPurchaseDetail: "/purchase-request-detail",
  urlPurchaseDetailUser: "/purchase-history-detail",
  urlUserVerification: "/verification",
  urlAdminVerification: "/admin-verification-detail",
  urlSocket: `${SITIO}/Notify/notify`,
  urlTerms: `${SITIO}/show-terms`,
  urlWithdrawarlRequest:"/withdrawal-request-detail",
  urlWithdrawarlUser:"/withdrawal",
  urlNotiPayment:"/user-payments-history",
  pusher: {
    key: '662198edb36cb2ef784d',
    cluster: 'us2'
  },
  apiUrl: SITIO
};
