# from pywebpush import webpush                                                                                  
# import base64                                                                                                  
# from cryptography.hazmat.primitives.asymmetric import ec                                                       
# from cryptography.hazmat.backends import default_backend                                                       
# from cryptography.hazmat.primitives import serialization                                                       
                                                                                                            
# # Generate keys                                                                                                
# private_key = ec.generate_private_key(ec.SECP256R1(), default_backend())                                       
# public_key = private_key.public_key()                                                                          
                                                                                                            
# # Export private key                                                                                           
# priv_bytes = private_key.private_numbers().private_value.to_bytes(32, 'big')                                   
# print('VAPID_PRIVATE_KEY=' + base64.urlsafe_b64encode(priv_bytes).decode().rstrip('='))                        
                                                                                                            
# # Export public key                                                                                            
# pub_bytes = public_key.public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint) 
# print('VAPID_PUBLIC_KEY=' + base64.urlsafe_b64encode(pub_bytes).decode().rstrip('='))   

from cryptography.hazmat.primitives.asymmetric import ec                                                     
from cryptography.hazmat.backends import default_backend                                                     
from cryptography.hazmat.primitives import serialization                                                     
import base64                                                                                                
                                                                                                            
# Generate new key pair                                                                                      
private_key = ec.generate_private_key(ec.SECP256R1(), default_backend())                                     
public_key = private_key.public_key()                                                                        
                                                                                                            
# Private key - raw 32 bytes, base64url encoded                                                              
priv_bytes = private_key.private_numbers().private_value.to_bytes(32, 'big')                                 
priv_b64 = base64.urlsafe_b64encode(priv_bytes).decode().rstrip('=')                                         
                                                                                                            
# Public key - uncompressed point, base64url encoded                                                         
pub_bytes = public_key.public_bytes(                                                                         
    serialization.Encoding.X962,                                                                             
    serialization.PublicFormat.UncompressedPoint                                                             
)                                                                                                            
pub_b64 = base64.urlsafe_b64encode(pub_bytes).decode().rstrip('=')                                           
                                                                                                            
print(f"VAPID_PRIVATE_KEY={priv_b64}")                                                                       
print(f"VAPID_PUBLIC_KEY={pub_b64}")                                                                         
print(f"\nPrivate key length: {len(priv_b64)} chars (should be ~43)")                                        
print(f"Public key length: {len(pub_b64)} chars (should be ~87)") 