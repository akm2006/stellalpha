// Terminal banner for Stellalpha development environment
// Displays ASCII logo when running `pnpm dev`

const LOGO = `
                                        
                   AA                   
                   AAA                  
                  AAAAA                 
                 AAAAAA                 
                AAAA AAA                
               AAAA   AAA               
           AAAAAAA AA AAAAAAA           
   AAAAAAAAAAAAAA AAAA AAAAAAAAAAAAAA   
     AAAAA       AAAAAA       AAAAA     
       AAAAA    AAAAAAAA    AAAAA       
          AAAA AAAA   A  AAAAAA         
            A AAAA     AAAAA            
              AAA    AAAAA              
             AAA  AAAAA   AA            
            AAA  AAAA    AAAA           
           AAA  AA        AAA           
          AAAA             AAA          
         AAA                AAA         
                                        
`;

// ANSI color codes
const EMERALD = '\x1b[38;2;16;185;129m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';

function printBanner() {
  // Clear screen
  process.stdout.write('\x1b[2J\x1b[0f');

  // Print logo in emerald green
  console.log(`${BOLD}${EMERALD}${LOGO}${RESET}`);

  // Print version info
  console.log(`${DIM}   Stellalpha v0.1.0${RESET}`);
  console.log(`${CYAN}   Development Server${RESET}\n`);
}

printBanner();

