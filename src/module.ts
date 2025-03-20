import { resolve, dirname, extname, basename, join } from "node:path";
import { compile } from "sass";
import { defineNuxtModule, addPlugin, createResolver, resolvePath, useLogger } from "@nuxt/kit";
import { mkdirSync, writeFileSync, readdirSync } from "node:fs";

import { name, version } from "../package.json";

// supported rules
export type LazyLoadRule = "widthGT" | "widthLT";

// rule specific configuration
export type LazyLoadRuleScreenSize = { width: number };

// rule to configuration mapper
interface LazyLoadRuleConfigMap {
  widthGT: LazyLoadRuleScreenSize;
  widthLT: LazyLoadRuleScreenSize;
}

// RuleConfigurations maps each LazyLoadRule to its corresponding config
export type LazyLoadRuleConfiguration = {
  [key in LazyLoadRule]?: LazyLoadRuleConfigMap[key];
};

export interface LazyCSSFile extends LazyLoadRuleConfiguration {
  // relative to nuxt.options.rootDir
  filePath: string;
  // relative to nuxt.options.rootDir
  outputFilename?: string;
}

// ModuleOptions ensures that files are correctly typed based on the rule and includes the LazyLoadRuleConfiguration
export interface ModuleOptions extends LazyLoadRuleConfiguration {
  outputDir?: string;
  inputDir?: string;
  files?: LazyCSSFile[];
  plugin?: boolean;
}

export interface LazyLoadProcessedFiles {
  path: string;
  rules: LazyLoadRuleConfiguration;
}

const logger = useLogger(`nuxt:${version}`);
const rootDir = `node_modules/.cache/${version}`;

const defaults: Required<Pick<ModuleOptions, "inputDir" | "outputDir" | "plugin">> = {
  inputDir: "app/assets/scss",
  outputDir: "assets/css",
  plugin: true,
};

// remove OS shenannigans with folder dividers
const normalizePath = (path: string) => path.replaceAll(/[/\\]/g, "");

const getFilesToProcess = (specificFiles: LazyCSSFile[], rules: LazyLoadRuleConfiguration, inputDir?: string) => {
  // if user only specified specific files, no need to do anything regarding dir search
  if (specificFiles.length && !inputDir) {
    return specificFiles;
  }

  // maps files to object where key is input path to be able to remove duplicates if user also has inputDir
  const files: Record<string, LazyCSSFile> = specificFiles.reduce<Record<string, LazyCSSFile>>((res, item) => {
    res[normalizePath(item.filePath)] = { ...rules, ...item };
    return res;
  }, {});

  readdirSync(inputDir!, { withFileTypes: true, recursive: true }).forEach((file) => {
    const path = join(file.parentPath, file.name);
    const normalizedPath = normalizePath(path);

    if (file.isDirectory()) {
      return;
    }

    if (normalizedPath in files) {
      logger.warn(
        `You manually included a file in "files" that also exist in the directory you defined with "inputDir". Skipping duplicate file ${path}`,
      );
    } else {
      files[normalizedPath] = { filePath: path, ...rules };
    }
  });

  return Object.values(files);
};

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name,
    version,
    configKey: "lazyLoadCSS",
    compatibility: { nuxt: ">=3.0.0" },
  },
  defaults,
  async setup(options, nuxt) {
    const { plugin, files, outputDir, inputDir, ...rules } = options;

    if (!files && !rules) {
      logger.warn("No files were defined. Stopping");
      return;
    }

    try {
      // ensure output dir exists
      const resolvedOutputDir = await resolvePath(resolve(rootDir, outputDir || defaults.outputDir));
      mkdirSync(resolvedOutputDir, { recursive: true });

      const processedFiles: LazyLoadProcessedFiles[] = [];

      getFilesToProcess(files || [], rules, inputDir).forEach(({ filePath, outputFilename, ...rules }) => {
        const filename = outputFilename || `${basename(filePath, extname(filePath))}.css`;
        const outputPath = outputFilename
          ? // if user specified filename for end product, use it
            resolve(dirname(resolvedOutputDir), filename)
          : // if not, use the original filename
            resolve(resolvedOutputDir, filename);

        // compile to css
        const result = compile(resolve(nuxt.options.rootDir, filePath), { style: "compressed" });

        if (!result) {
          logger.error(`Failed to compile "${filePath}": "${JSON.stringify(result)}"`);
          return;
        }

        if (!result.css) {
          logger.warn(`"${filePath}" is empty, skipping file`);
          return;
        }

        logger.debug(`SCSS compiled successfully ${outputPath}`);

        // write compiled css to outputPath
        writeFileSync(outputPath, result.css);
        processedFiles.push({ path: join(outputDir || defaults.outputDir, filename), rules });

        logger.debug(`Compiled files stored in ${outputPath} assets direction`);
      });

      // Add file to public directory
      nuxt.options.nitro = nuxt.options.nitro || {};
      nuxt.options.nitro.publicAssets = nuxt.options.nitro.publicAssets || [];
      nuxt.options.nitro.publicAssets.push({ dir: resolvedOutputDir, baseURL: outputDir || defaults.outputDir });
      logger.debug("Styles added to public assets direction");

      // Register plugin
      if (plugin) {
        logger.debug("Registering plugin");

        nuxt.options.runtimeConfig.app = nuxt.options.runtimeConfig.app || {};
        nuxt.options.runtimeConfig.app.lazyLoadCSS = processedFiles;

        addPlugin(
          {
            mode: "client",
            name: `${name}.client.ts`,
            src: createResolver(import.meta.url).resolve("./runtime/plugin"),
          },
          { append: true },
        );
      }

      logger.log("Compilation finished");
    } catch (err) {
      logger.error(err);
    }
  },
});
