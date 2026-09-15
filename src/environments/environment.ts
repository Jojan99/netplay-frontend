// This file can be replaced during build by using the `fileReplacements` array.
// `ng build --prod` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

/**
 * El sitio desde el que se abre el panel. La compilación de producción usa
 * este archivo (angular.json no reemplaza por environment.prod.ts), así que el
 * mismo build sirve igual en netplay.com.co y en netvula.com: la API se pide al
 * mismo dominio de la página. Fuera de https (desarrollo en localhost o el
 * prerender del servidor) se usa el dominio de producción.
 */
const SITIO = typeof window !== 'undefined' && /^https:\/\//.test(window.location?.origin ?? '')
  ? window.location.origin
  : 'https://netplay.com.co';

export const environment = {
  production: false,
  // rootUrl: "https://bitllionaire.live/API/",
  //rootUrl: "https://netplay.com.co/netplay/public/",
 //rootUrl: "https://globalinfinet.co/netplay/public/",
  // rootUrlWeb: "http://localhost:4200/",

 rootUrl: `${SITIO}/`,
  //  rootUrl: "http://192.168.2.6:44364/",
  // rootUrl: "http://192.168.2.6:1743/",
 
  // rootUrl: "http://192.168.1.80:1743/",
  urlVerificateUser: 'http://localhost:4200/verificate/user',
  urlReset: "http://localhost:4200/reset-password",
  urlRegister: "http://localhost:4200/sign-up",
  urlTickets: "/ticket-detail",
  urlPurchaseDetail: "/purchase-request-detail",
  urlPurchaseDetailUser: "/purchase-history-detail",
  urlUserVerification: "/verification",
  urlAdminVerification: "/admin-verification-detail",
  urlSocket: "https://networkgolden.com:443/Notify/notify",
  urlTerms: "http://localhost:4200/show-terms",
  urlApp: "http://localhost:4200/",
  urlWithdrawarlRequest:"/withdrawal-request-detail",
  urlWithdrawarlUser:"/withdrawal/",
  urlNotiPayment:"/user-payments-history",
  // rootUrl: "https://networkgolden.com/API/",
  // urlVerificateUser: 'https://networkgolden.com/NetworkGolden/verificate/user',
  // urlReset: "https://networkgolden.com/NetworkGoldeneset-password",
  // urlRegister: "https://networkgolden.com/NetworkGolden/sign-up",
  // urlTickets: "/ticket-detail",
  // urlPurchaseDetail: "/purchase-history-detail",
  // urlUserVerification: "/verification",
  // urlAdminVerification: "/admin-verification-detail",
  // urlSocket: "https://networkgolden.com:443/Notify/notify"
  pusher: {
    key: '662198edb36cb2ef784d',
    cluster: 'us2'
  },
  //apiUrl: 'https://netplay.com.co/netplay/public/'
  apiUrl: SITIO
};



/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/dist/zone-error';  // Included with Angular CLI.
