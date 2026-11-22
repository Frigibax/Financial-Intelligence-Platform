"""
Main entry point for Multi-Agent Market Intelligence (MAMI).
Run in VS Code using:
    python main.py pw
    python main.py apple
    python main.py microsoft
    python main.py "tata steel"
or launch the web app:
    python main.py --web
"""
import sys
from run import run_cli_analysis, run_web_server

if __name__ == "__main__":
    if "--web" in sys.argv:
        run_web_server()
    else:
        # Check for company argument
        company = None
        for arg in sys.argv[1:]:
            if not arg.startswith("--"):
                company = arg
                break
            
        if not company:
            for i, arg in enumerate(sys.argv):
                if (arg == "--ticker" or arg == "--company") and i + 1 < len(sys.argv):
                    company = sys.argv[i + 1]
                    break
                    
        if not company:
            try:
                user_input = input("Enter Company Name or Ticker (e.g. pw, apple, microsoft, tesla, reliance) [default=AAPL]: ").strip()
                company = user_input if user_input else "AAPL"
            except (EOFError, KeyboardInterrupt):
                company = "AAPL"
                
        run_cli_analysis(company_query=company)
