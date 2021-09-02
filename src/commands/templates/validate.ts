import chalk from 'chalk'
import ora from 'ora'
import { table, getBorderCharacters } from 'table'
import untildify from 'untildify'
import { existsSync } from 'fs-extra'
import { createManifest } from './helpers'
import { ServerClient } from 'postmark'
import {
  TemplateValidateArguments,
} from '../../types'
import { pluralize, log, validateToken } from '../../utils'

export const command = 'validate <templates directory> [options]'
export const desc =
  'Validate templates from <templates directory> against a Postmark server'

export const builder = {
  'server-token': {
    type: 'string',
    hidden: true,
  },
  'request-host': {
    type: 'string',
    hidden: true,
  }
}
export const handler = (args: TemplateValidateArguments) => exec(args)

/**
 * Execute the command
 */
const exec = (args: TemplateValidateArguments) => {
  const { serverToken } = args

  return validateToken(serverToken).then(token => {
    validateDirectory(token, args)
  })
}

/**
 * Check if directory exists before pushing
 */
const validateDirectory = (
  serverToken: string,
  args: TemplateValidateArguments
) => {
  const rootPath: string = untildify(args.templatesdirectory)

  // Check if path exists
  if (!existsSync(rootPath)) {
    log('The provided path does not exist', { error: true })
    return process.exit(1)
  }

  return validate(serverToken, args)
}

interface ValidationError {
    Message: string
}

/**
 * Begin pushing the templates
 */
const validate = (serverToken: string, args: TemplateValidateArguments) => {
  const { templatesdirectory, requestHost } = args
  const spinner = ora('Fetching templates...').start()
  const manifest = createManifest(templatesdirectory)
  const client = new ServerClient(serverToken)

  if (requestHost !== undefined && requestHost !== '') {
    client.clientOptions.requestHost = requestHost
  }

  // Make sure manifest isn't empty
  if (manifest.length > 0) {
    // Validate Each against postmark
    Promise.all(manifest.map(m => 
        client.validateTemplate({HtmlBody: m.HtmlBody})
            .then(response => { 
                const { HtmlBody: { ValidationErrors = [] } } = response
                return (ValidationErrors as ValidationError[])
                    .map(e => [m.Name, m.Alias, e.Message])
            })
            .catch((error: any) => {
                spinner.stop()
                log(error, { error: true })
                process.exit(1)
            })
    ))
    .then(response => response.filter(r => r && r.length > 0))
    .then(results => processErrors(
        {
            spinner,
            results: results.reduce((acc, cur) => (acc||[]).concat(cur||[]), []) || []
        }
    ))
    .catch((error: any) => {
        spinner.stop()
        log(error, { error: true })
        process.exit(1)
    })

  } else {
    spinner.stop()
    log('No templates or layouts were found.', { error: true })
    process.exit(1)
  }
}

interface ValidationResults {
    spinner: any
    results: (string | undefined)[][]
}
/**
 * Compare templates and CLI flow
 */
const processErrors = (config: ValidationResults) => {
  const { spinner, results } = config

  spinner.stop()
  if (results.length === 0) return log('✅  Validation passed!', { color: 'green' })
  // Show which templates are changing
  printReview(results)
}

/**
 * Show which templates will change after the publish
 */
const printReview = (results: any[]) => {

  // Table headers
  const header = [chalk.gray('Name'), chalk.gray('Alias'), chalk.gray('Error')]

  // Labels
  const templatesLabel =
  results.length > 0
      ? `${results.length} ${pluralize(
        results.length,
          'template',
          'templates'
        )}`
      : ''

  // Log template and layout files
  if (results.length > 0) {
    log(`\n${templatesLabel}`)
    log(
      table([header, ...results], {
        border: getBorderCharacters('norc'),
      })
    )
    process.exit(1)
  }

  // Log summary
  log(
    chalk.yellow(
      `${templatesLabel}`
    )
  )
}

// /**
//  * Run each time a push has been completed
//  */
// const pushComplete = (
//   success: boolean,
//   response: object,
//   template: TemplateManifest,
//   spinner: any,
//   total: number
// ) => {
//   // Update counters
//   results[success ? 'success' : 'failed']++
//   const completed = results.success + results.failed

//   // Log any errors to the console
//   if (!success) {
//     spinner.stop()
//     log(`\n${template.Alias}: ${response.toString()}`, { error: true })
//     spinner.start()
//   }

//   if (completed === total) {
//     spinner.stop()

//     log('✅ All finished!', { color: 'green' })

//     // Show failures
//     if (results.failed) {
//       log(
//         `⚠️ Failed to push ${results.failed} ${pluralize(
//           results.failed,
//           'template',
//           'templates'
//         )}. Please see the output above for more details.`,
//         { error: true }
//       )
//     }
//   }
// }
