import { defineConfig } from 'vite'
// import basicSsl from '@vitejs/plugin-basic-ssl'
import react from '@vitejs/plugin-react-swc'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // basicSsl({
    //   /** name of certification */
    //   // name: 'Anlatan testing',
    //   /** custom trust domains */
    //   // domains: ['*.anlatan.local'],
    //   /** custom certification directory */
    //   certDir: '../cert',
    // }),
  ],
  // server: {
  //   https: true, // Vite will automatically generate and use a self-signed certificate
  //   host: true
  // }
})
