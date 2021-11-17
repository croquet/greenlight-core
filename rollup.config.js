import { terser } from 'rollup-plugin-terser';

const config = {
    plugins: [
        terser({
            mangle: {
                module: true,
            },
            keep_classnames: true,
            keep_fnames: true,
        }),
    ]
};

export default config;
