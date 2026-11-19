import React from 'react';
import { motion } from 'framer-motion';

const Footer = () => (
  <motion.footer
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    transition={{ duration: 0.6, delay: 0.8 }}
    className="text-center mt-12 pt-8 border-t border-slate-200"
  >
    <p className="text-slate-500 text-sm">
      © {new Date().getFullYear()} Comprasuy | Datos de comprasestatales.gub.uy
    </p>
  </motion.footer>
);

export default Footer;